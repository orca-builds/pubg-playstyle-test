import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const token = "A".repeat(43);
const source = ts.createSourceFile("TestRunner.tsx",
  readFileSync(new URL("../src/components/TestRunner.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["commit", "ensureFresh", "handleSelect", "persistAnswers", "handleNext"];
const declarations = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(declarations.length, names.length);
const code = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS },
}).outputText;

function setup(options = {}) {
  const requests = [];
  const h = createHarness({ ...options, fetch: async (url, init) => {
    requests.push({ url, init });
    if (options.fetch) return options.fetch(url, init);
    return Response.json({ saved: true, last_question_index: JSON.parse(init.body).question_index });
  } });
  const progressLib = h.load("src/lib/testProgress.ts");
  const credentials = h.load("src/lib/attemptCredentials.ts");
  const sync = h.load("src/lib/syncDatabaseAnswers.ts");
  const tracking = h.load("src/lib/testAnalytics.ts");
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  const restored = progressLib.restoreAttempt(h.window.localStorage.getItem(progressLib.TEST_STORAGE_KEY));
  const progress = restored.kind === "in_progress" ? restored.progress : progressLib.createAttempt(randomUUID());
  if (restored.kind !== "in_progress") {
    progressLib.saveAttempt(h.window.localStorage, progress);
    h.window.localStorage.setItem(credentials.CREDENTIAL_STORAGE_KEY, JSON.stringify({
      attemptId: progress.attemptId, writeToken: token, startedAt: progress.startedAt,
    }));
  }
  const state = { progress, answerStatus: sync.hasUnsyncedAnswers(h.window.localStorage, progress) ? "pending" : "ready", error: "", route: "" };
  const answerSaveLock = { current: false };
  const mounted = { current: true };
  function render() {
    const dependencies = {
      completionPending: false, completionDraft: { current: null }, setCompletionPending() {},
      completeDatabaseAttempt: async () => undefined, clearPendingCompletion() {},
      ...progressLib, ...sync, ...tracking, ...credentials,
      progress: state.progress, answerStatus: state.answerStatus, answerSaveLock,
      mounted, startLock: { current: false }, completionLock: { current: false },
      window: h.window, orderedQuestions: questions,
      setProgress: value => { state.progress = value; },
      setAnswerStatus: value => { state.answerStatus = value; },
      setError: value => { state.error = value; },
      setScreen() {}, setNeedsNewStart() {}, setIsNavigating() {}, startNew() { throw new Error("Unexpected start"); },
      prepareResultSnapshot: h.load("src/lib/resultSnapshot.ts").prepareResultSnapshot,
      router: { push: value => { state.route = value; } },
    };
    return new Function("dependencies", `const { ${Object.keys(dependencies).join(",")} } = dependencies; ${code}; return { ${names.join(",")} };`)(dependencies);
  }
  async function settle() {
    await sync.syncDatabaseAnswers(state.progress).catch(() => {});
    await Promise.resolve();
  }
  return { ...h, requests, progressLib, credentials, sync, questions, state, render, settle, answerSaveLock, mounted };
}

test("actual selection updates local state immediately, disables advancement until DB acknowledgement, and protects token", async () => {
  let resolve;
  const h = setup({ fetch: () => new Promise(done => { resolve = done; }) });
  const choice = h.questions[0].choices[0].id;
  h.render().handleSelect(choice);
  assert.equal(h.state.progress.answers[0].choiceId, choice);
  assert.equal(h.state.answerStatus, "saving");
  h.render().handleNext();
  h.render().handleSelect(h.questions[0].choices[1].id);
  assert.equal(h.requests.length, 1);
  assert.equal(h.state.progress.currentQuestionIndex, 0);
  assert.ok(!h.requests[0].url.includes(token));
  assert.deepEqual(JSON.parse(h.requests[0].init.body), {
    write_token: token, question_id: h.questions[0].id, answer_id: choice, question_index: 1,
  });
  resolve(Response.json({ saved: true, last_question_index: 1 }));
  await h.settle();
  assert.equal(h.state.answerStatus, "ready");
  h.render().handleNext();
  assert.equal(h.state.progress.currentQuestionIndex, 1);
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  assert.equal(h.events.filter(event => event.name === "question_answer").length, 1);
  assert.ok(!JSON.stringify(h.events).includes(token));
  assert.ok(!JSON.stringify(h.state).includes(token));
  assert.ok(!h.window.localStorage.getItem(h.sync.ANSWER_SYNC_KEY).includes(token));
});

test("DB errors preserve selection but block next/result; manual retry does not duplicate Analytics events", async () => {
  for (const status of [403, 404, 409, 500]) {
    let fail = true;
    const h = setup({ fetch: async () => fail ? Response.json({ error: token }, { status }) :
      Response.json({ saved: true, last_question_index: 1 }) });
    h.render().handleSelect(h.questions[0].choices[0].id);
    await h.settle();
    assert.equal(h.state.answerStatus, "error");
    assert.ok(h.state.error && !h.state.error.includes(token));
    h.render().handleNext();
    assert.equal(h.state.progress.currentQuestionIndex, 0);
    assert.equal(h.requests.length, 1);
    fail = false;
    await h.render().persistAnswers(h.state.progress);
    assert.equal(h.state.answerStatus, "ready");
    h.render().handleNext();
    assert.equal(h.state.progress.currentQuestionIndex, 1);
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    assert.equal(h.events.filter(event => event.name === "question_answer").length, 1);
  }
});

test("reload after failed save uses same credential and reconciles before next, without a start request", async () => {
  const h = setup({ fetch: async () => { throw new Error("private-network-error"); } });
  h.render().handleSelect(h.questions[0].choices[0].id);
  await h.settle();
  const reload = setup({ localStorage: h.window.localStorage });
  assert.equal(reload.state.answerStatus, "pending");
  reload.render().handleNext();
  assert.equal(reload.state.progress.currentQuestionIndex, 0);
  await reload.render().persistAnswers(reload.state.progress);
  assert.equal(reload.requests.length, 1);
  assert.equal(reload.requests[0].url, `/api/attempts/${h.state.progress.attemptId}/answers`);
  assert.equal(JSON.parse(reload.requests[0].init.body).write_token, token);
  assert.equal(reload.state.answerStatus, "ready");
});

test("reload of acknowledged answers sends nothing; changed choice sends update and keeps answer_change semantics", async () => {
  const h = setup();
  h.render().handleSelect(h.questions[0].choices[0].id);
  await h.settle();
  const reload = setup({ localStorage: h.window.localStorage });
  await reload.sync.syncDatabaseAnswers(reload.state.progress);
  assert.equal(reload.requests.length, 0);
  reload.render().handleSelect(h.questions[0].choices[1].id);
  await reload.settle();
  assert.equal(reload.requests.length, 1);
  assert.equal(JSON.parse(reload.requests[0].init.body).answer_id, h.questions[0].choices[1].id);
  await reload.load("src/lib/analytics.ts").initializeAnalytics();
  assert.deepEqual(reload.events.map(event => event.name), ["question_answer", "answer_change"]);
});

test("returning to an old choice after a lost response must re-save instead of trusting its old acknowledgement", async () => {
  let fail = false;
  const h = setup({ fetch: async () => {
    if (fail) throw new Error("response lost");
    return Response.json({ saved: true, last_question_index: 1 });
  } });
  h.render().handleSelect(h.questions[0].choices[0].id);
  await h.settle();
  fail = true;
  h.render().handleSelect(h.questions[0].choices[1].id);
  await h.settle();
  fail = false;
  h.render().handleSelect(h.questions[0].choices[0].id);
  await h.settle();
  assert.equal(h.requests.length, 3);
  assert.equal(h.state.answerStatus, "ready");
});

test("old local-only answers sync in displayed order and partial success resumes from the remaining answers", async () => {
  let fail = true;
  const h = setup({ fetch: async (url, init) => {
    const index = JSON.parse(init.body).question_index;
    return fail && index === 2 ? new Response(null, { status: 500 }) : Response.json({ saved: true, last_question_index: index });
  } });
  for (let i = 0; i < 3; i++) {
    h.state.progress = h.progressLib.selectAnswer(h.state.progress, h.questions[i].choices[0].id);
    if (i < 2) h.state.progress = h.progressLib.moveQuestion(h.state.progress, 1);
  }
  h.progressLib.saveAttempt(h.window.localStorage, h.state.progress);
  await h.render().persistAnswers(h.state.progress);
  assert.equal(h.state.answerStatus, "error");
  fail = false;
  await h.render().persistAnswers(h.state.progress);
  assert.deepEqual(h.requests.map(({ init }) => JSON.parse(init.body).question_index), [1, 2, 2, 3]);
  assert.equal(h.state.answerStatus, "ready");
});

test("local progress/ack storage failure cannot silently permit navigation", async () => {
  for (const failKey of ["progress", "ack"]) {
    const h = setup();
    const storage = h.window.localStorage;
    const setItem = storage.setItem;
    let ackWrites = 0;
    storage.setItem = (key, value) => {
      if (key === h.sync.ANSWER_SYNC_KEY) ackWrites += 1;
      if ((failKey === "progress" && key === h.progressLib.TEST_STORAGE_KEY) ||
          (failKey === "ack" && key === h.sync.ANSWER_SYNC_KEY && ackWrites > 1)) throw new Error("quota");
      setItem(key, value);
    };
    h.render().handleSelect(h.questions[0].choices[0].id);
    if (failKey === "ack") await h.settle();
    h.render().handleNext();
    assert.equal(h.state.progress.currentQuestionIndex, 0);
    assert.notEqual(h.state.answerStatus, "ready");
    if (failKey === "progress") assert.equal(h.requests.length, 0);
  }
});

test("same pending snapshot shares a request and changed concurrent snapshots are rejected", async () => {
  let resolve;
  const h = setup({ fetch: () => new Promise(done => { resolve = done; }) });
  const first = h.progressLib.selectAnswer(h.state.progress, h.questions[0].choices[0].id);
  const p1 = h.sync.syncDatabaseAnswers(first);
  const p2 = h.sync.syncDatabaseAnswers(first);
  assert.equal(p1, p2);
  const other = h.progressLib.selectAnswer(first, h.questions[0].choices[1].id);
  await assert.rejects(h.sync.syncDatabaseAnswers(other), { message: "ANSWER_SAVE_FAILED" });
  resolve(Response.json({ saved: true, last_question_index: 1 }));
  await p1;
  assert.equal(h.requests.length, 1);
});

test("malformed responses and missing credentials fail closed without exposing server text", async () => {
  for (const fetch of [async () => new Response("private", { status: 200 }),
    async () => Response.json({ saved: true, last_question_index: 0 }),
    async () => Response.json({ saved: true, last_question_index: 25 }),
    async () => Response.json({ saved: false, last_question_index: 1 })]) {
    const h = setup({ fetch });
    h.render().handleSelect(h.questions[0].choices[0].id);
    await h.settle();
    assert.equal(h.state.answerStatus, "error");
    assert.ok(!h.state.error.includes("private"));
  }
  const h = setup();
  h.window.localStorage.removeItem(h.credentials.CREDENTIAL_STORAGE_KEY);
  await assert.rejects(h.sync.syncDatabaseAnswers(h.state.progress), { message: "ANSWER_SAVE_FAILED" });
  assert.equal(h.requests.length, 0);
});

test("all 24 acknowledged answers still reach completion with existing scoring/result snapshot", async () => {
  const h = setup();
  for (const question of h.questions) {
    h.render().handleSelect(question.choices[0].id);
    await h.settle();
    await h.render().handleNext();
  }
  assert.equal(h.state.route, "/result");
  assert.equal(h.requests.length, 24);
  assert.ok(h.requests.every(({ url }) => url.endsWith("/answers")));
  const saved = h.progressLib.restoreAttempt(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY));
  assert.equal(saved.kind, "completed");
  const snapshot = h.load("src/lib/resultSnapshot.ts").resolveResultSnapshot(JSON.stringify(saved.progress));
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.attemptId, h.state.progress.attemptId);
  assert.ok(!JSON.stringify(snapshot).includes(token));
});
