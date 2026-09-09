import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHarness, memoryStorage } from "./helpers/analyticsHarness.mjs";

function setup(options) {
  const h = createHarness(options);
  return {
    ...h, progress: h.load("src/lib/testProgress.ts"), analytics: h.load("src/lib/analytics.ts"),
    tracking: h.load("src/lib/testAnalytics.ts"), questions: h.load("src/data/questionOrder.ts").orderedQuestions,
  };
}

function finish(h, attempt) {
  for (const question of h.questions) {
    attempt = h.progress.selectAnswer(attempt, question.choices[0].id);
    attempt = h.progress.moveQuestion(attempt, 1);
  }
  return h.progress.finishAttempt(attempt);
}

test("test_start and test_complete occur once per attempt across duplicate calls and refresh", async () => {
  const localStorage = memoryStorage();
  let completed;
  for (let i = 0; i < 2; i++) {
    const h = setup({ localStorage });
    const attempt = h.progress.createAttempt("same-attempt");
    h.tracking.trackTestStart(attempt, false);
    h.tracking.trackTestStart(attempt, false);
    completed ??= finish(h, attempt);
    h.tracking.trackTestComplete(completed.progress, completed.result);
    h.tracking.trackTestComplete(completed.progress, completed.result);
    await h.analytics.initializeAnalytics();
    assert.deepEqual(h.events.map(e => e.name), i === 0 ? ["test_start", "test_complete"] : []);
  }
});

test("every choice uses stable answer ID and the actual displayed position/label", async () => {
  const h = setup();
  const start = h.progress.createAttempt("answers");
  for (const [index, question] of h.questions.entries()) {
    const attempt = { ...start, currentQuestionIndex: index };
    question.choices.forEach((choice) => h.tracking.trackAnswer(attempt, choice.id, true));
  }
  await h.analytics.initializeAnalytics();
  assert.equal(h.events.length, 48);
  h.events.forEach(({ name, properties }, i) => {
    assert.equal(name, "question_answer");
    assert.equal(properties.question_id, h.questions[Math.floor(i / 2)].id);
    assert.equal(properties.question_index, Math.floor(i / 2) + 1);
    assert.equal(properties.answer_id, h.questions[Math.floor(i / 2)].choices[i % 2].id);
    assert.equal(properties.display_position, i % 2 + 1);
    assert.equal(properties.display_label, i % 2 === 0 ? "A" : "B");
  });
});

test("answer_change requires a different persisted answer; first/same/failed saves do not increment", async () => {
  const h = setup();
  let attempt = h.progress.createAttempt("changes");
  const [a, b] = h.questions[0].choices.map(c => c.id);
  h.tracking.trackAnswer(attempt, a, true);
  attempt = h.progress.selectAnswer(attempt, a);
  h.tracking.trackAnswer(attempt, a, true);
  h.tracking.trackAnswer(attempt, b, false);
  h.tracking.trackAnswer(attempt, b, true);
  await h.analytics.initializeAnalytics();
  assert.equal(h.events.filter(e => e.name === "question_answer").length, 4);
  const changes = h.events.filter(e => e.name === "answer_change");
  assert.equal(changes.length, 1);
  assert.equal(changes[0].properties.previous_answer_id, a);
  assert.equal(changes[0].properties.new_answer_id, b);
  assert.equal(h.tracking.getAttemptMetrics(attempt.attemptId).answer_change_count, 1);
});

test("counts and retry classification survive refresh and completion carries all scores/tags", async () => {
  const localStorage = memoryStorage();
  const h = setup({ localStorage });
  let attempt = h.progress.createAttempt("metrics", Date.now() - 5000);
  h.tracking.trackTestStart(attempt, true);
  const [a, b] = h.questions[0].choices.map(c => c.id);
  attempt = h.progress.selectAnswer(attempt, a);
  h.tracking.trackAnswer(attempt, b, true);
  h.tracking.trackBack({ ...attempt, currentQuestionIndex: 1 }, 0);
  h.progress.saveAttempt(localStorage, attempt);
  const reloaded = setup({ localStorage });
  const restored = reloaded.progress.restoreAttempt(localStorage.getItem(reloaded.progress.TEST_STORAGE_KEY));
  assert.equal(restored.progress.attemptId, attempt.attemptId);
  const completed = finish(reloaded, restored.progress);
  reloaded.tracking.trackTestComplete(completed.progress, completed.result);
  await reloaded.analytics.initializeAnalytics();
  const event = reloaded.events.find(e => e.name === "test_complete").properties;
  assert.equal(event.answer_change_count, 1);
  assert.equal(event.back_count, 1);
  assert.equal(event.is_retry, true);
  assert.ok(event.duration_seconds >= 5);
  assert.equal(event.main_type, completed.result.mainResult.id);
  assert.deepEqual(event.main_scores, completed.result.mainScores);
  assert.equal(event.top_sub_tag_1, completed.result.displaySubTags[0]);
  assert.equal(event.top_sub_tag_2, completed.result.displaySubTags[1] ?? null);
});

test("actual startNew callback generates fresh retry UUID, saves before start, and consumes retry request", async () => {
  const h = setup();
  const old = h.progress.createAttempt("old-attempt");
  h.tracking.trackRetry(old, true);
  assert.equal(h.tracking.hasRetryRequest(), true);
  const source = ts.createSourceFile("TestRunner.tsx", readFileSync(new URL("../src/components/TestRunner.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "startNew") callback = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let created;
  const dependencies = {
    createAttempt: h.progress.createAttempt, crypto: { randomUUID }, window: h.window,
    saveAttempt: h.progress.saveAttempt, clearRetryRequest: h.tracking.clearRetryRequest,
    trackTestStart: (next, retry) => {
      assert.equal(h.progress.restoreAttempt(h.window.localStorage.getItem(h.progress.TEST_STORAGE_KEY)).progress.attemptId, next.attemptId);
      h.tracking.trackTestStart(next, retry);
    },
    setProgress: (next) => { created = next; }, setScreen() {}, setConfirmRestart() {}, setError() {},
    setNotice() {}, setIsNavigating() {}, completionLock: { current: false },
  };
  const startNew = new Function("dependencies", `const { ${Object.keys(dependencies).join(",")} } = dependencies; return (${callback});`)(dependencies);
  startNew("", true);
  assert.notEqual(created.attemptId, old.attemptId);
  assert.match(created.attemptId, /^[0-9a-f-]{36}$/);
  assert.equal(h.tracking.hasRetryRequest(), false);
  await h.analytics.initializeAnalytics();
  assert.deepEqual(h.events.map(e => [e.name, e.properties.attempt_id]), [["retry_click", "old-attempt"], ["test_start", created.attemptId]]);
});

test("SDK and analytics storage failure never prevent answer save, restore or scoring", async () => {
  for (const options of [{ env: {} }, { loadError: true }, { initError: true }, { captureError: true }]) {
    const h = setup(options);
    const storage = h.window.localStorage;
    const originalSet = storage.setItem;
    storage.setItem = (key, value) => {
      if (key.includes(":analytics:") || key.includes(":visitor:")) throw new Error("analytics denied");
      originalSet(key, value);
    };
    const attempt = h.progress.createAttempt("safe");
    h.tracking.trackTestStart(attempt, false);
    const completed = finish(h, attempt);
    h.progress.saveAttempt(storage, completed.progress);
    h.tracking.trackTestComplete(completed.progress, completed.result);
    await h.analytics.initializeAnalytics();
    assert.equal(h.progress.restoreAttempt(storage.getItem(h.progress.TEST_STORAGE_KEY)).kind, "completed");
    assert.equal(h.events.length, 0);
  }
});

function findEffect(file, contains) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" &&
        node.arguments[0].getText(source).includes(contains)) callback = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, `Missing ${contains} effect`);
  return (dependencies) => new Function("dependencies", `const { ${Object.keys(dependencies).join(",")} } = dependencies; return (${callback});`)(dependencies)();
}

test("actual question view effect ignores Strict Mode/rerender but records back and redisplay", async () => {
  const h = setup();
  const effect = findEffect("TestRunner.tsx", "trackQuestionView");
  const state = {
    progress: h.progress.createAttempt("views"), screen: "questions", confirmRestart: false,
    isNavigating: false, lastQuestionView: { current: null }, trackQuestionView: h.tracking.trackQuestionView,
  };
  effect(state);
  effect(state); // Strict Mode effect replay.
  state.progress = h.progress.selectAnswer(state.progress, h.questions[0].choices[0].id);
  effect(state); // Answer-only rerender.
  state.progress = h.progress.moveQuestion(state.progress, 1);
  effect(state);
  state.progress = h.progress.moveQuestion(state.progress, -1);
  effect(state);
  state.confirmRestart = true;
  effect(state); // Question is hidden.
  state.confirmRestart = false;
  effect(state);
  await h.analytics.initializeAnalytics();
  assert.deepEqual(h.events.map(e => e.properties.question_index), [1, 2, 1, 1]);
});

test("actual result effect requires ready snapshot; refresh/revisit counts a new view, not completion", async () => {
  const h = setup();
  const effect = findEffect("ResultPreview.tsx", "result_view");
  const done = finish(h, h.progress.createAttempt("result"));
  const state = { snapshot: { status: "initializing" }, lastView: { current: null }, trackEvent: h.analytics.trackEvent };
  for (const status of ["initializing", "missing", "invalid", "error"]) {
    state.snapshot = { status };
    effect(state);
  }
  state.snapshot = { status: "ready", attemptId: "result", result: done.result };
  effect(state);
  effect(state);
  state.lastView = { current: null }; // Fresh mount/document after revisit or reload.
  effect(state);
  await h.analytics.initializeAnalytics();
  assert.deepEqual(h.events.map(e => e.name), ["result_view", "result_view"]);
});
