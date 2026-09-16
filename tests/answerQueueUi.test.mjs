import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";
import { setup, saved, tick } from "./helpers/answerQueueHarness.mjs";

function renderRunner(h, { status, screen = "questions", navigating = false, completionPending = false, restarting = false, confirmRestart = false, notice = "" }) {
  // Controlled hook state renders the real fieldset/footer and resume callbacks.
  const values = [h.state.progress, screen, navigating, confirmRestart, "", notice, false, false, status, completionPending, restarting];
  let index = 0;
  const ui = createHarness({ localStorage: h.window.localStorage, mocks: {
    react: {
      useState: () => { const i = index++; return [values[i], value => { values[i] = value; }]; },
      useRef: initial => ({ current: initial }), useEffect() {}, useCallback: callback => callback,
    },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/syncDatabaseAnswers": h.sync,
  } });
  const tree = ui.load("src/components/TestRunner.tsx").default();
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return { nodes, html: renderToStaticMarkup(tree), values };
}

test("real question UI keeps fieldset/navigation/restart enabled during background saves and only shows failure feedback", () => {
  const h = setup();
  for (let i = 0; i < 3; i++) {
    h.state.progress = h.progressLib.selectAnswer(h.state.progress, h.questions[i].choices[0].id);
    h.state.progress = h.progressLib.moveQuestion(h.state.progress, 1);
  }
  h.state.progress = h.progressLib.moveQuestion(h.state.progress, -1);
  for (const status of ["pending", "saving", "error"]) {
    const ui = renderRunner(h, { status });
    assert.equal(ui.nodes.find(node => node.type === "fieldset").props.disabled, false);
    for (const label of ["이전", "다음", "처음부터 다시하기"]) {
      assert.equal(ui.nodes.find(node => node.type === "button" && node.props.children === label).props.disabled, false);
    }
    assert.equal(ui.html.includes("답변 저장 다시 시도"), status === "error");
    assert.equal(ui.html.includes('role="alert"'), status === "error");
    assert.ok(!ui.html.includes("완료 저장 중"));
  }
  const finishing = renderRunner(h, { status: "saving", navigating: true });
  assert.equal(finishing.nodes.find(node => node.type === "fieldset").props.disabled, true);
});

test("compact progress keeps the answer count when going back and Q24 still offers completion", () => {
  const h = setup();
  const first = renderRunner(h, { status: "ready" });
  assert.equal(first.nodes.find(n => n.type === "button" && n.props.children === "이전").props.disabled, true);
  assert.ok(first.html.includes("평소 실제 플레이에 가까운 선택을 골라주세요."));
  assert.equal(first.nodes.find(n => n.type === "progress").props.value, 0);
  for (const question of h.questions) {
    h.state.progress = h.progressLib.selectAnswer(h.state.progress, question.choices[0].id);
    h.state.progress = h.progressLib.moveQuestion(h.state.progress, 1);
  }
  const last = renderRunner(h, { status: "ready" });
  assert.equal(last.nodes.find(n => n.type === "button" && n.props.children === "결과 보기").props.disabled, false);
  h.state.progress = h.progressLib.moveQuestion(h.state.progress, -1);
  const back = renderRunner(h, { status: "ready" });
  const progress = back.nodes.find(n => n.type === "progress");
  assert.equal(progress.props.value, 24);
  assert.equal(progress.props.max, 24);
  assert.ok(back.html.includes("24개 완료"));
  assert.equal(back.nodes.find(n => typeof n.props?.onSelect === "function").props.selectedChoiceId, h.questions[22].choices[0].id);
});

test("update notice only appears before the first answer and cannot reappear on back navigation", () => {
  const h = setup();
  const notice = "테스트가 업데이트되어 새 테스트를 시작합니다.";
  assert.ok(!renderRunner(h, { status: "ready" }).html.includes(notice));
  const updated = renderRunner(h, { status: "ready", notice });
  assert.equal(updated.nodes.filter(n => n.props?.role === "status").length, 1);
  assert.ok(updated.html.includes(notice));
  h.state.progress = h.progressLib.selectAnswer(h.state.progress, h.questions[0].choices[0].id);
  assert.ok(!renderRunner(h, { status: "ready", notice }).html.includes(notice));
  h.state.progress = h.progressLib.moveQuestion(h.progressLib.moveQuestion(h.state.progress, 1), -1);
  assert.ok(!renderRunner(h, { status: "ready", notice }).html.includes(notice));
});

test("long questions stay in a scroll region while navigation reserves its own safe-area row", () => {
  const h = setup();
  for (const index of [17, 20, 23]) {
    h.state.progress = { ...h.state.progress, currentQuestionIndex: index };
    const ui = renderRunner(h, { status: "ready" });
    const scroll = ui.nodes.find(n => n.props?.className?.includes("overflow-y-auto"));
    const footer = ui.nodes.find(n => n.type === "footer");
    const parent = ui.nodes.find(n => Array.isArray(n.props?.children) && n.props.children.includes(footer));
    assert.ok(parent.props.children.includes(scroll));
    assert.match(scroll.props.className, /min-h-0 flex-1/);
    assert.match(scroll.props.className, /pb-6/);
    assert.match(footer.props.className, /shrink-0/);
    assert.match(footer.props.className, /env\(safe-area-inset-bottom\)/);
    assert.ok(ui.html.includes(h.questions[index].text));
    for (const choice of h.questions[index].choices) assert.ok(ui.html.includes(choice.text));
    const card = ui.nodes.find(n => typeof n.props?.onSelect === "function");
    const rendered = card.type(card.props);
    for (const button of rendered.props.children[1].props.children) {
      assert.match(button.props.children[0].props.className, /w-6 shrink-0/);
      assert.match(button.props.children[1].props.className, /min-w-0 flex-1/);
      assert.match(button.props.className, /motion-reduce:transition-none/);
    }
  }
});

test("real resume button opens questions without waiting for recovered background saves", async () => {
  let resolve;
  const h = setup({ fetch: (url, init) => new Promise(done => { resolve = () => done(saved(init)); }) });
  h.state.progress = h.progressLib.moveQuestion(h.progressLib.selectAnswer(h.state.progress, h.questions[0].choices[0].id), 1);
  h.progressLib.saveAttempt(h.window.localStorage, h.state.progress);
  const ui = renderRunner(h, { status: "pending", screen: "resume" });
  ui.nodes.find(node => node.type === "button" && node.props.children === "이어서 하기").props.onClick();
  assert.equal(ui.values[1], "questions");
  assert.equal(h.requests.length, 1);
  resolve(); await tick();
  assert.equal(h.sync.hasUnsyncedAnswers(h.window.localStorage, h.state.progress), false);
});

test("Next is disabled without an answer, enables immediately on selection, and moves only on click", async () => {
  let resolve;
  const h = setup({ fetch: (url, init) => new Promise(done => { resolve = () => done(saved(init)); }) });
  const nextButton = ui => ui.nodes.find(node => node.type === "button" && node.props.children === "다음");
  assert.equal(nextButton(renderRunner(h, { status: "ready" })).props.disabled, true);
  const initial = renderRunner(h, { status: "ready" });
  initial.nodes.find(node => typeof node.props?.onSelect === "function").props.onSelect(h.questions[0].choices[0].id);
  h.state.progress = initial.values[0];
  assert.equal(h.state.progress.currentQuestionIndex, 0);
  const selected = renderRunner(h, { status: "saving" });
  assert.equal(selected.nodes.find(node => typeof node.props?.onSelect === "function").props.selectedChoiceId, h.questions[0].choices[0].id);
  assert.equal(nextButton(selected).props.disabled, false);
  nextButton(selected).props.onClick();
  assert.equal(selected.values[0].currentQuestionIndex, 1);
  assert.equal(h.requests.length, 1);
  resolve(); await tick();
});

test("restart confirmation disables cancel and duplicate restart during drain and shows loading", () => {
  const ui = renderRunner(setup(), { status: "saving", confirmRestart: true, restarting: true });
  const buttons = ui.nodes.filter(node => node.type === "button");
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(node => node.props.disabled));
  assert.ok(ui.html.includes("다시 시작하는 중..."));
  assert.ok(ui.html.includes('aria-busy="true"'));
});
