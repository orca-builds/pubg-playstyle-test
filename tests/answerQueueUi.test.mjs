import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";
import { setup, saved, tick } from "./helpers/answerQueueHarness.mjs";

function renderRunner(h, { status, screen = "questions", navigating = false, completionPending = false, restarting = false, confirmRestart = false }) {
  // Controlled hook state renders the real fieldset/footer and resume callbacks.
  const values = [h.state.progress, screen, navigating, confirmRestart, "", "", false, false, status, completionPending, restarting];
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
