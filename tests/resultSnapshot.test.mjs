import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const modules = new Map();
function loadSource(relativePath) {
  if (modules.has(relativePath)) return modules.get(relativePath);
  const { outputText } = ts.transpileModule(readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (id) => {
    if (!id.startsWith("@/")) return require(id);
    const file = `src/${id.slice(2)}`;
    return loadSource(existsSync(path.join(root, `${file}.ts`)) ? `${file}.ts` : `${file}.tsx`);
  });
  modules.set(relativePath, exports);
  return exports;
}

const store = loadSource("src/lib/resultSnapshot.ts");
const { createAttempt, selectAnswer, moveQuestion, finishAttempt, saveAttempt, TEST_STORAGE_KEY } = loadSource("src/lib/testProgress.ts");
const { orderedQuestions } = loadSource("src/data/questionOrder.ts");
const ResultPreview = loadSource("src/components/ResultPreview.tsx").default;
const ResultContent = loadSource("src/components/ResultContent.tsx").default;
const MainAxisBars = loadSource("src/components/MainAxisBars.tsx").default;
const { resultTypes } = loadSource("src/data/resultTypes.ts");
const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
const values = new Map();
const events = new Map();
let blocked = false;
const originalWindow = globalThis.window;
globalThis.window = {
  location: { href: "http://localhost:3000/result" },
  localStorage: {
    getItem(key) { if (blocked) throw new Error("blocked"); return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  },
  addEventListener(name, listener) {
    if (!events.has(name)) events.set(name, new Set());
    events.get(name).add(listener);
  },
  removeEventListener(name, listener) { events.get(name)?.delete(listener); },
};
after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function complete(id, choiceIndex = 0) {
  let progress = createAttempt(id, Date.now() - 1000);
  for (const question of orderedQuestions) {
    progress = selectAnswer(progress, question.choices[choiceIndex].id);
    progress = moveQuestion(progress, 1);
  }
  return finishAttempt(progress);
}

test("첫 완료: 저장 후 준비한 결과를 즉시 사용하고 같은 snapshot 유지", () => {
  const done = complete("first");
  saveAttempt(window.localStorage, done.progress);
  store.prepareResultSnapshot(done.progress, done.result);
  const snapshot = store.getResultSnapshot();
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.attemptId, "first");
  assert.equal(snapshot.result, done.result);
  assert.equal(store.getResultSnapshot(), snapshot);
});

test("A 완료 → 새 attempt 진행 → B 완료에서 이전 결과를 재사용하지 않음", () => {
  const a = complete("a", 0);
  saveAttempt(window.localStorage, a.progress);
  store.prepareResultSnapshot(a.progress, a.result);
  assert.equal(store.getResultSnapshot().attemptId, "a");
  saveAttempt(window.localStorage, createAttempt("b"));
  assert.equal(store.getResultSnapshot().status, "missing");
  const b = complete("b", 1);
  saveAttempt(window.localStorage, b.progress);
  store.prepareResultSnapshot(b.progress, b.result);
  const snapshot = store.getResultSnapshot();
  assert.equal(snapshot.attemptId, "b");
  assert.equal(snapshot.result, b.result);
  assert.notEqual(snapshot.result.mainResult.id, a.result.mainResult.id);
});

test("과거 메모리 결과와 현재 저장값이 다르면 현재 attempt로 복구", () => {
  const old = complete("old");
  store.prepareResultSnapshot(old.progress, old.result);
  const current = complete("current", 1);
  saveAttempt(window.localStorage, current.progress);
  const snapshot = store.getResultSnapshot();
  assert.equal(snapshot.attemptId, "current");
  assert.deepEqual(snapshot.result, current.result);
});

test("새로고침으로 메모리 준비값이 없어도 최종 답변에서 동일 결과 복원", () => {
  const done = complete("refresh", 1);
  saveAttempt(window.localStorage, done.progress);
  store.retryResultSnapshot();
  assert.deepEqual(store.getResultSnapshot(), {
    status: "ready", attemptId: "refresh", result: done.result,
  });
});

test("초기화, 실제 결과 없음, 손상 데이터를 각각 구분", () => {
  assert.equal(store.getServerResultSnapshot().status, "initializing");
  values.delete(TEST_STORAGE_KEY);
  assert.equal(store.getResultSnapshot().status, "missing");
  values.set(TEST_STORAGE_KEY, "{bad json");
  assert.equal(store.getResultSnapshot().status, "invalid");
  const invalid = complete("invalid").progress;
  values.set(TEST_STORAGE_KEY, JSON.stringify({ ...invalid, answers: [] }));
  assert.equal(store.getResultSnapshot().status, "invalid");
});

test("저장소 차단은 안정된 오류 snapshot, 접근 복구 후 재시도 가능", () => {
  const done = complete("retry");
  saveAttempt(window.localStorage, done.progress);
  blocked = true;
  assert.equal(store.getResultSnapshot().status, "error");
  assert.equal(store.getResultSnapshot(), store.getResultSnapshot());
  blocked = false;
  store.retryResultSnapshot();
  assert.equal(store.getResultSnapshot().attemptId, "retry");
});

test("구독 정리·재등록 후 완료 통지는 한 번이며 저장소를 다시 쓰지 않음", () => {
  let calls = 0;
  const listener = () => { calls++; };
  const unsubscribe = store.subscribeToResult(listener);
  unsubscribe();
  const unsubscribeAgain = store.subscribeToResult(listener);
  const done = complete("subscribe");
  saveAttempt(window.localStorage, done.progress);
  const before = values.get(TEST_STORAGE_KEY);
  store.prepareResultSnapshot(done.progress, done.result);
  assert.equal(calls, 1);
  assert.equal(values.get(TEST_STORAGE_KEY), before);
  unsubscribeAgain();
  assert.equal(events.get("storage").size, 0);
  assert.equal(events.get("pageshow").size, 0);
});

test("초기 HTML에 loading·결과 없음·이전 결과를 잠깐 표시하지 않음", () => {
  const done = complete("ssr");
  saveAttempt(window.localStorage, done.progress);
  store.prepareResultSnapshot(done.progress, done.result);
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider,
    { value: { push() {} } }, createElement(ResultPreview)));
  assert.ok(html.includes("테스트 결과"));
  assert.ok(!html.includes("결과를 확인하고 있습니다"));
  assert.ok(!html.includes("완료된 테스트 결과가 없습니다"));
  assert.ok(!html.includes(done.result.mainResult.name));
});

// 브라우저 없이도 실제 완료 핸들러의 중복 호출과 작업 순서를 검증합니다.
const runnerSource = ts.createSourceFile("TestRunner.tsx",
  readFileSync(path.join(root, "src/components/TestRunner.tsx"), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handleNextSource;
function findHandler(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleNext") handleNextSource = node.getText(runnerSource);
  ts.forEachChild(node, findHandler);
}
findHandler(runnerSource);

function completionHandler({ failSave = false } = {}) {
  const completed = complete("handler");
  const progress = { ...completed.progress, status: "in_progress" };
  const events = [];
  let saveFails = failSave;
  const dependencies = {
    progress, orderedQuestions, completionLock: { current: false },
    ensureFresh: () => true, canGoNext: () => true,
    finishAttempt: (attempt) => { events.push("calculate"); return finishAttempt(attempt); },
    saveAttempt: (storage, attempt) => {
      events.push("save");
      if (saveFails) throw new Error("save failed");
      saveAttempt(storage, attempt);
    },
    prepareResultSnapshot: (attempt, result) => {
      events.push("prepare");
      store.prepareResultSnapshot(attempt, result);
    },
    setIsNavigating: () => {}, setError: () => {},
    router: { push: (href) => {
      assert.equal(href, "/result");
      assert.equal(store.getResultSnapshot().attemptId, "handler");
      events.push("navigate");
    } },
  };
  const handler = new Function("dependencies",
    `const { ${Object.keys(dependencies).join(",")} } = dependencies; ${handleNextSource}; return handleNext;`)(dependencies);
  return { handler, events, allowSave: () => { saveFails = false; } };
}

test("실제 결과 보기 핸들러를 연속 호출해도 계산·저장·준비·이동은 한 번", () => {
  const { handler, events } = completionHandler();
  handler();
  handler();
  handler();
  assert.deepEqual(events, ["calculate", "save", "prepare", "navigate"]);
});

test("완료 저장 실패 시 이동하지 않으며 잠금을 풀어 재시도 가능", () => {
  const { handler, events, allowSave } = completionHandler({ failSave: true });
  handler();
  assert.deepEqual(events, ["calculate", "save"]);
  allowSave();
  handler();
  assert.deepEqual(events, ["calculate", "save", "calculate", "save", "prepare", "navigate"]);
});

function renderResult(snapshot) {
  return renderToStaticMarkup(createElement(ResultContent, {
    snapshot, onStartTest() {}, onRetryLoad() {},
  }));
}

test("legacy 완료 기록은 이전 캐시 대신 invalid 안내, 새 테스트 완료 후 정상 복구", () => {
  const done = complete("before-legacy");
  saveAttempt(window.localStorage, done.progress);
  store.prepareResultSnapshot(done.progress, done.result);
  for (const choiceId of ["q01-a", "q01-b", "q01-choice-3"]) {
    saveAttempt(window.localStorage, { ...done.progress, answers: [
      { questionId: "q01", choiceId }, ...done.progress.answers.slice(1),
    ] });
    assert.deepEqual(store.getResultSnapshot(), { status: "invalid" });
    store.retryResultSnapshot();
    assert.deepEqual(store.getResultSnapshot(), { status: "invalid" });
    assert.ok(renderResult(store.getResultSnapshot()).includes("저장된 결과가 유효하지 않습니다."));
  }
  saveAttempt(window.localStorage, createAttempt("retry-new"));
  assert.equal(store.getResultSnapshot().status, "missing");
  const retried = complete("retry-new", 1);
  saveAttempt(window.localStorage, retried.progress);
  store.prepareResultSnapshot(retried.progress, retried.result);
  store.retryResultSnapshot();
  assert.deepEqual(store.getResultSnapshot(), {
    status: "ready", attemptId: "retry-new", result: retried.result,
  });
});

test("16개 유형의 이름·summary·description을 원문 그대로 표시", () => {
  const done = complete("content");
  for (const result of Object.values(resultTypes)) {
    const html = renderResult({ status: "ready", attemptId: "content", result: { ...done.result, mainResult: result } });
    assert.ok(html.includes("당신의 배그 플레이 유형은"));
    assert.ok(html.includes(result.name));
    assert.ok(html.includes(result.summary));
    assert.ok(html.includes(result.description));
    assert.ok(html.indexOf(result.name) < html.indexOf(result.summary));
    assert.ok(html.indexOf(result.summary) < html.indexOf(result.description));
  }
});

test("실제 완료 결과의 최종 보조 태그와 4축 퍼센트를 표시", () => {
  const done = complete("percentages");
  const html = renderResult({ status: "ready", attemptId: "percentages", result: done.result });
  for (const tag of done.result.displaySubTags) assert.ok(html.includes(tag));
  for (const label of ["교전 100%", "포지션 0%", "선봉 100%", "서포트 0%", "직접 압박 100%", "전투 설계 0%", "리스크 100%", "안정 0%"])
    assert.ok(html.includes(label), label);
  assert.ok(!html.includes("편향도"));
  assert.ok(!html.includes("원점수"));
});

test("보조 태그 한 개·두 개와 긴 태그를 그대로 표시", () => {
  const done = complete("tags");
  for (const tags of [["올라운더"], ["날개형", "올라운더"], ["날개형", "보따리형"], ["매우 긴 보조 성향 이름을 확인하는 태그"]]) {
    const html = renderResult({ status: "ready", attemptId: "tags", result: { ...done.result, displaySubTags: tags } });
    for (const tag of tags) assert.ok(html.includes(tag));
    assert.ok(html.includes("flex-wrap"));
  }
});

test("100/0부터 0/100까지 두 막대 비율 유지, 중앙선과 위치 마커 없음", () => {
  for (const [first, second] of [[100, 0], [80, 20], [60, 40], [40, 60], [20, 80], [0, 100]]) {
    const percentages = {
      combat: first, position: second, frontline: first, support: second,
      pressure: first, design: second, risk: first, safe: second,
    };
    const html = renderToStaticMarkup(createElement(MainAxisBars, { percentages }));
    assert.equal((html.match(new RegExp(`style="width:${first}%"`, "g")) ?? []).length, 4);
    assert.equal((html.match(new RegExp(`style="width:${second}%"`, "g")) ?? []).length, 4);
    assert.ok(!html.includes("left-1/2"));
    assert.ok(!html.includes("absolute"));
    assert.ok(html.includes(`교전 ${first}%`));
    assert.ok(html.includes(`포지션 ${second}%`));
  }
});

test("이미지가 없으면 img 없이 공통 placeholder, 경로가 있으면 imageAlt 사용", () => {
  const done = complete("image");
  const snapshot = { status: "ready", attemptId: "image", result: done.result };
  const placeholder = renderResult(snapshot);
  assert.ok(placeholder.includes("캐릭터 이미지 준비 중"));
  assert.ok(!placeholder.includes("<img"));
  const withImage = renderResult({ ...snapshot, result: {
    ...done.result, mainResult: { ...done.result.mainResult, imageSrc: "/images/results/future.webp" },
  } });
  assert.ok(withImage.includes("<img"));
  assert.ok(withImage.includes(`alt="${done.result.mainResult.imageAlt}"`));
  assert.ok(!withImage.includes("캐릭터 이미지 준비 중"));
});

test("초기화는 무표시, 결과 없음·손상·저장소 오류는 적절한 안내와 시작 버튼", () => {
  assert.equal(renderResult({ status: "initializing" }), "");
  const missing = renderResult({ status: "missing" });
  assert.ok(missing.includes("아직 완료된 테스트 결과가 없습니다."));
  assert.ok(missing.includes("테스트 시작하기"));
  for (const status of ["invalid", "error"]) {
    const html = renderResult({ status });
    assert.ok(html.includes("결과를 불러오지 못했습니다."));
    assert.ok(html.includes("테스트 다시 시작"));
    assert.ok(!html.includes("결과를 확인하고 있습니다"));
  }
});

test("공유 버튼은 비활성으로 준비 중 안내, 다시 하기는 전달된 시작 동작 사용", () => {
  const done = complete("buttons");
  let starts = 0;
  const tree = ResultContent({ snapshot: { status: "ready", attemptId: "buttons", result: done.result },
    onStartTest() { starts++; }, onRetryLoad() {},
  });
  const actions = tree.props.children.at(-1);
  const share = actions.props.children[0];
  const restart = actions.props.children[2];
  assert.equal(share.props.disabled, true);
  assert.equal(share.props.onClick, undefined);
  assert.equal(restart.props.children, "다시 하기");
  restart.props.onClick();
  assert.equal(starts, 1);
});
