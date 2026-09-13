import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const source = ts.createSourceFile("ResultPreview.tsx",
  readFileSync(new URL("../src/components/ResultPreview.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function resultPage(h, snapshot) {
  let code;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleStartTest") code = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const state = { busy: false, error: "", retained: null, routes: [] };
  const deps = {
    snapshot, retrying: { current: false }, sharing: { current: false },
    setPreviousResult: value => { state.retained = value; },
    setIsStarting: value => { state.busy = value; },
    setStartError: value => { state.error = value; },
    trackRetry: h.load("src/lib/testAnalytics.ts").trackRetry,
    startDatabaseAttempt: h.load("src/lib/startDatabaseAttempt.ts").startDatabaseAttempt,
    router: { push: path => { state.routes.push(path); } },
  };
  const click = new Function("deps", `const {${Object.keys(deps).join(",")}} = deps; ${code}; return handleStartTest;`)(deps);
  return { state, click };
}

async function setup() {
  const requests = [];
  let responder = async () => Response.json({ attempt_id: randomUUID(), write_token: randomBytes(32).toString("base64url") }, { status: 201 });
  const h = createHarness({ href: "https://example.invalid/?utm_source=original&utm_campaign=launch", fetch: (...args) => {
    requests.push(args);
    return responder(...args);
  } });
  const storage = h.window.localStorage;
  const progress = h.load("src/lib/testProgress.ts");
  let attempt = await h.load("src/lib/startDatabaseAttempt.ts").startDatabaseAttempt();
  for (const question of h.load("src/data/questionOrder.ts").orderedQuestions) {
    attempt = progress.selectAnswer(attempt, question.choices[0].id);
    attempt = progress.moveQuestion(attempt, 1);
  }
  const completed = progress.finishAttempt(attempt);
  progress.saveAttempt(storage, completed.progress);
  const snapshots = h.load("src/lib/resultSnapshot.ts");
  const snapshot = snapshots.getResultSnapshot();
  const credentialKey = h.load("src/lib/attemptCredentials.ts").CREDENTIAL_STORAGE_KEY;
  const syncKey = h.load("src/lib/syncDatabaseAnswers.ts").ANSWER_SYNC_KEY;
  const pendingKey = h.load("src/lib/completeDatabaseAttempt.ts").COMPLETION_PENDING_KEY;
  storage.setItem(syncKey, JSON.stringify({ attemptId: attempt.attemptId, answers: { q01: "old" } }));
  storage.setItem(pendingKey, attempt.attemptId);
  const oldProgress = storage.getItem(progress.TEST_STORAGE_KEY);
  const oldCredential = storage.getItem(credentialKey);
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  h.events.length = 0;
  return { ...h, storage, progress, snapshot, snapshots, credentialKey, syncKey, pendingKey, oldProgress, oldCredential,
    requests, respond: fn => { responder = fn; }, ui: resultPage(h, snapshot) };
}

test("result retry waits for issuance, blocks double clicks, replaces local state and uses old/new analytics IDs", async () => {
  const h = await setup();
  let resolve;
  h.respond(() => new Promise(done => { resolve = done; }));
  const pending = h.ui.click();
  await h.ui.click();
  assert.equal(h.requests.length, 2); // Original start plus exactly one retry.
  assert.equal(h.ui.state.busy, true);
  assert.deepEqual(h.ui.state.routes, []);
  assert.equal(h.storage.getItem(h.progress.TEST_STORAGE_KEY), h.oldProgress);
  assert.equal(h.storage.getItem(h.credentialKey), h.oldCredential);
  const newId = randomUUID();
  const newToken = randomBytes(32).toString("base64url");
  resolve(Response.json({ attempt_id: newId, write_token: newToken }, { status: 201 }));
  await pending;
  await h.ui.click(); // Guard stays locked until route transition finishes.
  const firstRequest = JSON.parse(h.requests[0][1].body);
  const retryRequest = JSON.parse(h.requests[1][1].body);
  assert.deepEqual(retryRequest, { ...firstRequest, is_retry: true });
  assert.ok(h.requests.every(([url, options]) => url === "/api/attempts/start" && options.method === "POST"));
  const next = h.progress.restoreAttempt(h.storage.getItem(h.progress.TEST_STORAGE_KEY)).progress;
  assert.equal(next.attemptId, newId);
  assert.notEqual(next.attemptId, h.snapshot.attemptId);
  assert.deepEqual(next.answers, []);
  assert.equal(next.currentQuestionIndex, 0);
  assert.equal(next.status, "in_progress");
  assert.equal(next.completedAt, undefined);
  const credential = JSON.parse(h.storage.getItem(h.credentialKey));
  assert.equal(credential.writeToken, newToken);
  assert.notEqual(credential.writeToken, JSON.parse(h.oldCredential).writeToken);
  assert.equal(h.storage.getItem(h.syncKey), null);
  assert.equal(h.storage.getItem(h.pendingKey), null);
  assert.equal(h.snapshots.getResultSnapshot().status, "missing");
  assert.deepEqual(h.ui.state.retained, h.snapshot);
  assert.deepEqual(h.ui.state.routes, ["/test"]);
  h.load("src/lib/testAnalytics.ts").trackQuestionView(next, 0);
  assert.deepEqual(h.events.map(e => [e.name, e.properties.attempt_id]), [
    ["retry_click", h.snapshot.attemptId], ["test_start", newId], ["question_view", newId],
  ]);
  assert.equal(h.events[1].properties.is_retry, true);
  assert.ok(h.events.every(e => e.properties.anonymous_id === firstRequest.anonymous_id));
  assert.ok(!JSON.stringify(h.events).includes(newToken));
  assert.ok(!JSON.stringify(h.ui.state).includes(newToken));
  const reload = createHarness({ localStorage: h.storage, sessionStorage: h.window.sessionStorage });
  const restored = reload.load("src/lib/testProgress.ts").restoreAttempt(h.storage.getItem(h.progress.TEST_STORAGE_KEY));
  assert.equal(restored.progress.attemptId, newId);
  assert.equal(reload.load("src/lib/attemptCredentials.ts").readAttemptCredential(h.storage, restored.progress).writeToken, newToken);
  assert.equal(reload.load("src/lib/testAnalytics.ts").hasRetryRequest(), false);
});

test("failed retry preserves completed snapshot, credential and sidecars; explicit retry succeeds", async () => {
  const h = await setup();
  h.respond(async () => Response.json({ error: "private-server-error" }, { status: 500 }));
  await h.ui.click();
  assert.deepEqual(h.ui.state.routes, []);
  assert.equal(h.ui.state.busy, false);
  assert.ok(h.ui.state.error && !h.ui.state.error.includes("private-server-error"));
  assert.equal(h.storage.getItem(h.progress.TEST_STORAGE_KEY), h.oldProgress);
  assert.equal(h.storage.getItem(h.credentialKey), h.oldCredential);
  assert.ok(h.storage.getItem(h.syncKey));
  assert.ok(h.storage.getItem(h.pendingKey));
  assert.deepEqual(h.snapshots.getResultSnapshot(), h.snapshot);
  assert.deepEqual(h.events.map(e => e.name), ["retry_click"]);
  h.respond(async () => Response.json({ attempt_id: randomUUID(), write_token: randomBytes(32).toString("base64url") }, { status: 201 }));
  await h.ui.click();
  assert.deepEqual(h.ui.state.routes, ["/test"]);
  assert.equal(h.requests.length, 3);
});

test("retry persistence failure keeps old result; manual retry commits already issued credentials without another request", async () => {
  const h = await setup();
  const setItem = h.storage.setItem;
  h.storage.setItem = (key, value) => {
    if (key === h.progress.TEST_STORAGE_KEY) throw new Error("quota");
    setItem(key, value);
  };
  await h.ui.click();
  assert.deepEqual(h.ui.state.routes, []);
  assert.equal(h.storage.getItem(h.credentialKey), h.oldCredential);
  assert.deepEqual(h.snapshots.getResultSnapshot(), h.snapshot);
  assert.ok(h.storage.getItem(h.syncKey));
  h.storage.setItem = setItem;
  await h.ui.click();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.ui.state.routes, ["/test"]);
});

test("retry UI keeps result content, disables pending button and offers an accessible failure retry", async () => {
  const h = await setup();
  const Content = h.load("src/components/ResultContent.tsx").default;
  const render = props => renderToStaticMarkup(createElement(Content, {
    snapshot: h.snapshot, onStartTest() {}, onRetryLoad() {}, onShare() {}, ...props,
  }));
  const busy = render({ isStarting: true });
  assert.match(busy, /disabled="" aria-busy="true"/);
  assert.ok(busy.includes(h.snapshot.result.mainResult.name));
  const failed = render({ startError: "다시 시도해주세요." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /다시 하기 재시도/);
  assert.ok(failed.includes(h.snapshot.result.mainResult.name));
});
