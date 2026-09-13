import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const token = "A".repeat(43); // Fake canonical token, never a real credential.
function setup(options = {}) {
  const requests = [];
  const id = randomUUID();
  const h = createHarness({ ...options, fetch: async (...args) => {
    requests.push(args);
    return options.fetch ? options.fetch(...args) : Response.json({ attempt_id: id, write_token: token }, { status: 201 });
  } });
  return { ...h, requests, id,
    start: h.load("src/lib/startDatabaseAttempt.ts"),
    credentials: h.load("src/lib/attemptCredentials.ts"),
    progress: h.load("src/lib/testProgress.ts"),
    analytics: h.load("src/lib/analytics.ts"),
    tracking: h.load("src/lib/testAnalytics.ts"),
  };
}

// Exercise the actual component callbacks, with controlled state and browser dependencies.
const source = ts.createSourceFile("TestRunner.tsx",
  readFileSync(new URL("../src/components/TestRunner.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, dependencies) {
  let code;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) code = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(code);
  return new Function("dependencies", `const { ${Object.keys(dependencies).join(",")} } = dependencies; return (${code});`)(dependencies);
}
function runner(h) {
  const state = { progress: null, screen: "loading", error: "", starting: false, needsNew: false };
  const dependencies = {
    completionDraft: { current: null }, setCompletionPending() {},
    answerSaveLock: { current: false }, setAnswerStatus() {},
    startLock: { current: false }, mounted: { current: true }, completionLock: { current: false },
    setProgress: value => { state.progress = value; }, setScreen: value => { state.screen = value; },
    setError: value => { state.error = value; }, setIsStarting: value => { state.starting = value; },
    setNeedsNewStart: value => { state.needsNew = value; },
    setNotice() {}, setConfirmRestart() {}, setIsNavigating() {},
    startDatabaseAttempt: h.start.startDatabaseAttempt,
  };
  const startNew = callback("startNew", dependencies);
  const initialize = callback("initialize", { ...dependencies, startNew,
    window: h.window, restoreAttempt: h.progress.restoreAttempt, TEST_STORAGE_KEY: h.progress.TEST_STORAGE_KEY,
    hasPendingDatabaseStart: h.start.hasPendingDatabaseStart, hasRetryRequest: h.tracking.hasRetryRequest,
    readAttemptCredential: h.credentials.readAttemptCredential,
    hasUnsyncedAnswers: h.load("src/lib/syncDatabaseAnswers.ts").hasUnsyncedAnswers,
    hasPendingCompletion: h.load("src/lib/completeDatabaseAttempt.ts").hasPendingCompletion,
  });
  return { state, dependencies, startNew, initialize };
}

test("new start posts existing visitor/version/order data once, stores server ID/token and tracks the same ID", async () => {
  const h = setup({ href: "https://example.invalid/?utm_source=news&utm_medium=email&utm_campaign=launch" });
  const ui = runner(h);
  await ui.startNew();
  assert.equal(h.requests.length, 1);
  const [url, options] = h.requests[0];
  assert.equal(url, "/api/attempts/start");
  assert.equal(options.method, "POST");
  const { device_type, ...visitor } = h.load("src/lib/visitorContext.ts").getVisitorContext();
  assert.ok(device_type);
  assert.deepEqual(JSON.parse(options.body), { ...visitor, test_version: "v1", is_retry: false,
    question_order_key: h.load("src/data/questionOrder.ts").QUESTION_ORDER_KEY });
  const saved = h.progress.restoreAttempt(h.window.localStorage.getItem(h.progress.TEST_STORAGE_KEY)).progress;
  assert.equal(saved.attemptId, h.id);
  assert.equal(ui.state.progress.attemptId, h.id);
  assert.equal(ui.state.screen, "questions");
  assert.equal(h.credentials.readAttemptCredential(h.window.localStorage, saved).writeToken, token);
  h.tracking.trackQuestionView(saved, 0);
  await h.analytics.initializeAnalytics();
  assert.deepEqual(h.events.map(event => [event.name, event.properties.attempt_id]), [["test_start", h.id], ["question_view", h.id]]);
  assert.ok(!JSON.stringify(h.events).includes(token));
  assert.ok(!JSON.stringify(saved).includes(token));
  assert.ok(!JSON.stringify(ui.state).includes(token));
});

test("fresh document restores ID/token without another start or test_start event", async () => {
  const h = setup();
  const original = await h.start.startDatabaseAttempt();
  const reload = setup({ localStorage: h.window.localStorage });
  const ui = runner(reload);
  ui.initialize();
  ui.initialize();
  assert.equal(ui.state.screen, "questions");
  assert.deepEqual(ui.state.progress, original);
  assert.equal(reload.credentials.readAttemptCredential(reload.window.localStorage, original).writeToken, token);
  assert.equal(reload.requests.length, 0);
  await reload.analytics.initializeAnalytics();
  assert.equal(reload.events.length, 0);
});

test("duplicate initialization, clicks and another component share a single in-flight start", async () => {
  let resolve;
  const wait = new Promise(done => { resolve = done; });
  const h = setup({ fetch: () => wait });
  const first = runner(h);
  const second = runner(h);
  first.initialize();
  first.initialize();
  const duplicateClick = first.startNew();
  second.initialize();
  assert.equal(first.state.starting, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.window.localStorage.getItem(h.progress.TEST_STORAGE_KEY), null);
  resolve(Response.json({ attempt_id: h.id, write_token: token }, { status: 201 }));
  await h.start.startDatabaseAttempt();
  await duplicateClick;
  assert.equal(first.state.progress.attemptId, h.id);
  assert.equal(second.state.progress.attemptId, h.id);
  assert.equal(first.state.starting, false);
  await h.analytics.initializeAnalytics();
  assert.equal(h.events.filter(event => event.name === "test_start").length, 1);
});

test("API failures and invalid responses create no progress/credential and expose only a fixed error", async () => {
  for (const fetch of [
    async () => Response.json({ error: "private-secret" }, { status: 500 }),
    async () => { throw new Error("private-secret"); },
    async () => { throw new DOMException("private-secret", "TimeoutError"); },
    async () => new Response("private-secret", { status: 201 }),
    async () => Response.json({ attempt_id: "fake-id", write_token: token }, { status: 201 }),
    async () => Response.json({ attempt_id: randomUUID(), write_token: "bad" }, { status: 201 }),
  ]) {
    const h = setup({ fetch });
    const ui = runner(h);
    await ui.startNew();
    assert.equal(ui.state.progress, null);
    assert.equal(ui.state.screen, "loading");
    assert.equal(ui.state.starting, false);
    assert.ok(ui.state.error && !ui.state.error.includes("private-secret"));
    assert.equal(h.window.localStorage.getItem(h.progress.TEST_STORAGE_KEY), null);
    assert.equal(h.window.localStorage.getItem(h.credentials.CREDENTIAL_STORAGE_KEY), null);
    assert.equal(h.requests.length, 1);
    assert.equal(h.start.hasPendingDatabaseStart(), false);
    await h.analytics.initializeAnalytics();
    assert.equal(h.events.length, 0);
  }
});

test("manual retry after an API failure succeeds, without automatic retry", async () => {
  let fail = true;
  const id = randomUUID();
  const h = setup({ fetch: async () => fail ? new Response(null, { status: 500 }) :
    Response.json({ attempt_id: id, write_token: token }, { status: 201 }) });
  const ui = runner(h);
  await ui.startNew();
  assert.equal(h.requests.length, 1);
  fail = false;
  await ui.startNew();
  assert.equal(h.requests.length, 2);
  assert.equal(ui.state.progress.attemptId, id);
});

test("storage denial before start does not call API; persistence failure reuses issued credentials on retry", async () => {
  const denied = setup({ localStorage: { getItem() { throw new Error("denied"); } } });
  await assert.rejects(denied.start.startDatabaseAttempt(), { message: "START_FAILED" });
  assert.equal(denied.requests.length, 0);

  const h = setup();
  const storage = h.window.localStorage;
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === h.progress.TEST_STORAGE_KEY) throw new Error("quota");
    setItem(key, value);
  };
  await assert.rejects(h.start.startDatabaseAttempt(), { message: "START_FAILED" });
  assert.equal(storage.getItem(h.progress.TEST_STORAGE_KEY), null);
  assert.equal(storage.getItem(h.credentials.CREDENTIAL_STORAGE_KEY), null);
  assert.equal(h.start.hasPendingDatabaseStart(), true);
  storage.setItem = setItem;
  const progress = await h.start.startDatabaseAttempt();
  assert.equal(progress.attemptId, h.id);
  assert.equal(h.requests.length, 1);
  assert.equal(h.credentials.readAttemptCredential(storage, progress).writeToken, token);
});

test("missing, mismatched and expired credentials cannot resume legacy progress", () => {
  for (const raw of [null, "{bad", JSON.stringify({ attemptId: randomUUID(), writeToken: token, startedAt: new Date().toISOString() })]) {
    const h = setup();
    const progress = h.progress.createAttempt(randomUUID());
    h.progress.saveAttempt(h.window.localStorage, progress);
    if (raw !== null) h.window.localStorage.setItem(h.credentials.CREDENTIAL_STORAGE_KEY, raw);
    const ui = runner(h);
    ui.initialize();
    assert.equal(ui.state.needsNew, true);
    assert.equal(ui.state.progress, null);
    assert.equal(h.requests.length, 0);
  }
  const h = setup();
  const expired = h.progress.createAttempt(h.id, Date.now() - h.progress.ATTEMPT_TTL_MS);
  h.window.localStorage.setItem(h.credentials.CREDENTIAL_STORAGE_KEY,
    JSON.stringify({ attemptId: h.id, writeToken: token, startedAt: expired.startedAt }));
  assert.equal(h.credentials.readAttemptCredential(h.window.localStorage, expired), null);
});

test("retry helper passes is_retry; failed replacement preserves old progress and credential", async () => {
  const h = setup();
  await h.start.startDatabaseAttempt();
  const storage = h.window.localStorage;
  const oldProgress = storage.getItem(h.progress.TEST_STORAGE_KEY);
  const oldCredential = storage.getItem(h.credentials.CREDENTIAL_STORAGE_KEY);
  const reloaded = setup({ localStorage: storage });
  const setItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === h.progress.TEST_STORAGE_KEY) throw new Error("quota");
    setItem(key, value);
  };
  await assert.rejects(reloaded.start.startDatabaseAttempt(true));
  assert.equal(JSON.parse(reloaded.requests[0][1].body).is_retry, true);
  assert.equal(storage.getItem(h.progress.TEST_STORAGE_KEY), oldProgress);
  assert.equal(storage.getItem(h.credentials.CREDENTIAL_STORAGE_KEY), oldCredential);
});

test("analytics failure never prevents database start; canonical ID reaches completed result snapshot", async () => {
  const h = setup({ captureError: true });
  let progress = await h.start.startDatabaseAttempt();
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  for (const question of questions) {
    progress = h.progress.selectAnswer(progress, question.choices[0].id);
    progress = h.progress.moveQuestion(progress, 1);
  }
  const done = h.progress.finishAttempt(progress);
  h.progress.saveAttempt(h.window.localStorage, done.progress);
  const snapshot = h.load("src/lib/resultSnapshot.ts").resolveResultSnapshot(JSON.stringify(done.progress));
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.attemptId, h.id);
  assert.ok(!JSON.stringify(snapshot).includes(token));
  await h.analytics.initializeAnalytics();
  assert.equal(h.events.length, 0);
});

test("unmounted component does not update its UI after a successful pending start", async () => {
  let resolve;
  const h = setup({ fetch: () => new Promise(done => { resolve = done; }) });
  const ui = runner(h);
  const pending = ui.startNew();
  ui.dependencies.mounted.current = false;
  resolve(Response.json({ attempt_id: h.id, write_token: token }, { status: 201 }));
  await pending;
  assert.equal(ui.state.progress, null);
  const nextMount = runner(h);
  nextMount.initialize();
  assert.equal(nextMount.state.progress.attemptId, h.id);
  assert.equal(h.requests.length, 1);
});
