import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const token = "A".repeat(43);

test("complete timeout releases UI and preserves answers/credential for idempotent retry", async t => {
  const controller = new AbortController();
  let fail = true;
  t.mock.method(AbortSignal, "timeout", ms => { assert.equal(ms, 15_000); return fail ? controller.signal : new AbortController().signal; });
  const h = setup({ fetch: async (_, init) => {
    if (fail) return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    const body = JSON.parse(init.body);
    return Response.json({ completed: true, already_completed: true, duration_seconds: 60,
      answer_change_count: body.answer_change_count, back_count: body.back_count,
      result: Object.fromEntries(h.load("src/lib/completionResult.ts").RESULT_FIELDS.map(field => [field, body[field]])) });
  } });
  const credentialKey = h.load("src/lib/attemptCredentials.ts").CREDENTIAL_STORAGE_KEY;
  const credential = h.window.localStorage.getItem(credentialKey);
  const answers = h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY);
  const pending = h.handler()();
  await Promise.resolve(); await Promise.resolve();
  controller.abort(new DOMException("timed out", "TimeoutError"));
  await pending;
  assert.equal(h.state.navigating, false);
  assert.equal(h.state.route, "");
  assert.ok(h.state.error);
  assert.equal(h.window.localStorage.getItem(credentialKey), credential);
  assert.equal(h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY), answers);
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  assert.equal(h.events.filter(e => e.name === "test_complete").length, 0);
  fail = false;
  await h.handler()();
  assert.equal(h.state.route, "/result");
  assert.equal(h.events.filter(e => e.name === "test_complete").length, 1);
});
const source = ts.createSourceFile("TestRunner.tsx", readFileSync(new URL("../src/components/TestRunner.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handleNext;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleNext") handleNext = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);

function setup(options = {}) {
  const calls = [];
  const requests = [];
  let h;
  h = createHarness({ ...options, fetch: async (url, init) => {
    calls.push("db-call");
    requests.push({ url, init });
    if (options.fetch) return options.fetch(url, init);
    const body = JSON.parse(init.body);
    const fields = h.load("src/lib/completionResult.ts").RESULT_FIELDS;
    calls.push("db-response");
    return Response.json({ completed: true, already_completed: requests.length > 1,
      duration_seconds: 60, answer_change_count: body.answer_change_count, back_count: body.back_count,
      result: Object.fromEntries(fields.map(field => [field, body[field]])) });
  } });
  const lib = h.load("src/lib/testProgress.ts");
  const api = h.load("src/lib/completeDatabaseAttempt.ts");
  const tracking = h.load("src/lib/testAnalytics.ts");
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  const previous = lib.restoreAttempt(h.window.localStorage.getItem(lib.TEST_STORAGE_KEY));
  let progress = previous.kind === "in_progress" ? previous.progress : lib.createAttempt(randomUUID());
  if (previous.kind !== "in_progress") {
    for (const question of questions) {
      progress = lib.selectAnswer(progress, question.choices[0].id);
      progress = lib.moveQuestion(progress, 1);
    }
    lib.saveAttempt(h.window.localStorage, progress);
    h.window.localStorage.setItem(h.load("src/lib/attemptCredentials.ts").CREDENTIAL_STORAGE_KEY,
      JSON.stringify({ attemptId: progress.attemptId, writeToken: token, startedAt: progress.startedAt }));
  }
  const state = { navigating: false, error: "", pending: api.hasPendingCompletion(progress), route: "" };
  const completionLock = { current: false };
  const completionDraft = { current: null };
  const mounted = { current: true };
  let failLocal = options.failLocal ?? false;
  function handler() {
    const dependencies = {
      progress, orderedQuestions: questions, activeAttempt: { current: progress.attemptId },
      completionPending: state.pending, persistAnswers: async () => { calls.push("drain"); return true; },
      completionLock, completionDraft, mounted, ensureFresh: () => true, canGoNext: lib.canGoNext,
      finishAttempt: value => { calls.push("calculate"); return lib.finishAttempt(value); },
      completeDatabaseAttempt: api.completeDatabaseAttempt, clearPendingCompletion: api.clearPendingCompletion,
      setIsNavigating: value => { state.navigating = value; }, setCompletionPending: value => { state.pending = value; },
      setError: value => { state.error = value; }, window: h.window,
      saveAttempt: (storage, value) => {
        calls.push("save");
        if (failLocal) throw new Error("local quota");
        lib.saveAttempt(storage, value);
      },
      prepareResultSnapshot: (value, result) => { calls.push("snapshot"); h.load("src/lib/resultSnapshot.ts").prepareResultSnapshot(value, result); },
      trackTestComplete: (...args) => {
        assert.equal(lib.restoreAttempt(h.window.localStorage.getItem(lib.TEST_STORAGE_KEY)).kind, "completed");
        calls.push("analytics"); tracking.trackTestComplete(...args);
      },
      loadingTiming: h.load("src/lib/loadingTiming.ts").loadingTiming,
      router: { replace: value => { calls.push("navigate"); state.route = value; } },
    };
    return new Function("d", `const { ${Object.keys(dependencies).join(",")} } = d; ${handleNext}; return handleNext;`)(dependencies);
  }
  return { ...h, lib, api, progress, state, requests, calls, handler, completionDraft, mounted,
    allowLocal: () => { failLocal = false; } };
}

test("actual final handler orders DB completion before local snapshot/Analytics/navigation and blocks double click", async () => {
  const h = setup();
  const handle = h.handler();
  await Promise.all([handle(), handle(), handle()]);
  assert.deepEqual(h.calls, ["drain", "calculate", "db-call", "db-response", "save", "snapshot", "analytics", "navigate"]);
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.route, "/result");
  assert.equal(h.api.hasPendingCompletion(h.progress), false);
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const completed = h.events.filter(event => event.name === "test_complete");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].properties.attempt_id, h.progress.attemptId);
  assert.equal(completed[0].properties.duration_seconds, 60);
  assert.ok(!JSON.stringify(h.events).includes(token));
  assert.ok(!JSON.stringify(h.state).includes(token));
  assert.ok(!h.requests[0].url.includes(token));
});

test("complete failure keeps local answers/result and blocks navigation until manual retry succeeds", async () => {
  let fail = true;
  const h = setup({ fetch: async (url, init) => {
    if (fail) return Response.json({ error: token }, { status: 500 });
    const body = JSON.parse(init.body);
    return Response.json({ completed: true, already_completed: true, duration_seconds: 12, answer_change_count: 0, back_count: 0,
      result: Object.fromEntries(h.load("src/lib/completionResult.ts").RESULT_FIELDS.map(field => [field, body[field]])) });
  } });
  await h.handler()();
  assert.equal(h.state.route, "");
  assert.equal(h.state.navigating, false);
  assert.equal(h.state.pending, true);
  assert.ok(h.state.error && !h.state.error.includes(token));
  assert.equal(h.lib.restoreAttempt(h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY)).kind, "in_progress");
  const draft = h.completionDraft.current;
  assert.ok(draft.result);
  assert.equal(h.requests.length, 1);
  fail = false;
  await h.handler()();
  assert.equal(h.completionDraft.current, draft);
  assert.equal(h.state.route, "/result");
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  assert.equal(h.events.filter(event => event.name === "test_complete").length, 1);
});

test("reload after lost response preserves pending marker and same credentials for an idempotent retry", async () => {
  const h = setup({ fetch: async () => { throw new Error("lost-response-secret"); } });
  await h.handler()();
  const reload = setup({ localStorage: h.window.localStorage });
  assert.equal(reload.state.pending, true);
  assert.equal(reload.progress.attemptId, h.progress.attemptId);
  await reload.handler()();
  assert.ok(!reload.calls.includes("drain")); // The server may already have completed: never re-save answers.
  assert.equal(reload.requests.length, 1);
  assert.equal(reload.requests[0].url, `/api/attempts/${h.progress.attemptId}/complete`);
  assert.equal(JSON.parse(reload.requests[0].init.body).write_token, token);
  assert.equal(reload.state.route, "/result");
});

test("local completion persistence failure retains pending state and retries safely after DB success", async () => {
  const h = setup({ failLocal: true });
  await h.handler()();
  assert.equal(h.state.route, "");
  assert.equal(h.api.hasPendingCompletion(h.progress), true);
  assert.equal(h.lib.restoreAttempt(h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY)).kind, "in_progress");
  h.allowLocal();
  await h.handler()();
  assert.equal(h.state.route, "/result");
  assert.equal(h.requests.length, 2);
  assert.equal(h.calls.filter(call => call === "calculate").length, 1);
});

test("malformed/mismatched completion response cannot mark local progress completed", async () => {
  for (const fetch of [async () => new Response("private", { status: 200 }),
    async () => Response.json({ completed: true, already_completed: false, result: {} }),
    async () => new Response(null, { status: 403 }), async () => new Response(null, { status: 409 })]) {
    const h = setup({ fetch });
    await h.handler()();
    assert.equal(h.state.route, "");
    assert.equal(h.lib.restoreAttempt(h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY)).kind, "in_progress");
    assert.ok(!h.state.error.includes("private"));
  }
});

test("missing credential or blocked pending storage does not send a complete request", async () => {
  for (const mode of ["credential", "storage"]) {
    const h = setup();
    if (mode === "credential") h.window.localStorage.removeItem(h.load("src/lib/attemptCredentials.ts").CREDENTIAL_STORAGE_KEY);
    else h.window.localStorage.setItem = () => { throw new Error("storage-secret"); };
    await h.handler()();
    assert.equal(h.requests.length, 0);
    assert.equal(h.state.route, "");
  }
});

test("result snapshot reload recomputes locally without calling complete again", async () => {
  const h = setup();
  await h.handler()();
  const raw = h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY);
  const reload = createHarness({ localStorage: h.window.localStorage });
  const result = reload.load("src/lib/resultSnapshot.ts").resolveResultSnapshot(raw);
  assert.equal(result.status, "ready");
  assert.equal(result.attemptId, h.progress.attemptId);
  assert.deepEqual(result.result, h.completionDraft.current.result);
});

test("a cached draft from another attempt cannot overwrite the current canonical attempt", async () => {
  const h = setup();
  h.completionDraft.current = h.lib.finishAttempt({ ...h.progress, attemptId: randomUUID() });
  await h.handler()();
  const stored = h.lib.restoreAttempt(h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY));
  assert.equal(stored.kind, "completed");
  assert.equal(stored.progress.attemptId, h.progress.attemptId);
  assert.equal(h.completionDraft.current.progress.attemptId, h.progress.attemptId);
});

test("unmount while completing leaves recoverable progress without navigation or late UI updates", async () => {
  let resolve;
  const h = setup({ fetch: () => new Promise(done => { resolve = done; }) });
  const pending = h.handler()();
  await new Promise(resolve => setImmediate(resolve));
  h.mounted.current = false;
  resolve(Response.json({ completed: true, already_completed: false, duration_seconds: 2, answer_change_count: 0, back_count: 0,
    result: h.load("src/lib/completionResult.ts").toResultColumns(h.completionDraft.current.result) }));
  await pending;
  assert.equal(h.state.route, "");
  assert.equal(h.api.hasPendingCompletion(h.progress), true);
  assert.equal(h.lib.restoreAttempt(h.window.localStorage.getItem(h.lib.TEST_STORAGE_KEY)).kind, "in_progress");
});
