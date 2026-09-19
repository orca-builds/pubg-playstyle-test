import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createHarness } from "./helpers/analyticsHarness.mjs";
import { setup as answerSetup } from "./helpers/answerQueueHarness.mjs";

function browser(h, pathname = "/result") {
  const listeners = new Map();
  h.window.location = new URL(`https://example.invalid${pathname}`);
  const entries = [{ path: "/", state: { __NA: true } }, { path: pathname, state: { __NA: true } }];
  let index = 1;
  const history = {
    get state() { return entries[index].state; },
    replaceState(state) { entries[index].state = state; },
    replace(path) { entries[index] = { path, state: { __NA: true } }; h.window.location.pathname = path; },
    push(path) { entries.splice(index + 1); entries.push({ path, state: { __NA: true } }); index++; h.window.location.pathname = path; },
    go(delta) { index += delta; h.window.location.pathname = entries[index].path; emit("popstate", {}); },
  };
  h.window.history = history;
  h.window.addEventListener = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  };
  h.window.removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
  function emit(name, event) { listeners.get(name)?.forEach(fn => fn(event)); }
  return { history, entries, emit, listeners };
}

function completed(h, id = randomUUID(), choice = 0) {
  const lib = h.load("src/lib/testProgress.ts");
  let attempt = lib.createAttempt(id);
  for (const question of h.load("src/data/questionOrder.ts").orderedQuestions) {
    attempt = lib.selectAnswer(attempt, question.choices[choice].id);
    attempt = lib.moveQuestion(attempt, 1);
  }
  const done = lib.finishAttempt(attempt);
  lib.saveAttempt(h.window.localStorage, done.progress);
  return done;
}

function runnerHarness() {
  const state = [], refs = [], effects = [], callbacks = [];
  let stateIndex = 0, refIndex = 0;
  const routes = [];
  const h = createHarness({ mocks: {
    react: {
      useState(initial) { const i = stateIndex++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
      useRef(initial) { const i = refIndex++; return refs[i] ?? (refs[i] = { current: initial }); },
      useCallback(fn) { callbacks.push(fn); return fn; },
      useEffect(fn) { effects.push(fn); },
    },
    "next/navigation": { useRouter: () => ({ replace: path => routes.push(path) }) },
  } });
  const b = browser(h, "/test");
  const Component = h.load("src/components/TestRunner.tsx").default;
  function render() { stateIndex = 0; refIndex = 0; callbacks.length = 0; effects.length = 0; Component(); }
  render();
  return { ...h, ...b, state, routes, effects, initialize: () => callbacks[1](), render };
}

test("completed TestRunner mount, persisted pageshow and popstate return to landing without starting", async () => {
  const h = runnerHarness();
  const done = completed(h);
  const raw = h.window.localStorage.getItem(h.load("src/lib/testProgress.ts").TEST_STORAGE_KEY);
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const cleanup = h.effects[0]();
  await Promise.resolve();
  h.emit("pageshow", { persisted: true });
  h.emit("popstate", {});
  assert.deepEqual(h.routes, ["/", "/", "/"]);
  assert.equal(h.state[0], null);
  assert.equal(h.state[1], "loading");
  assert.equal(h.window.localStorage.getItem(h.load("src/lib/testProgress.ts").TEST_STORAGE_KEY), raw);
  assert.equal(h.load("src/lib/resultSnapshot.ts").getResultSnapshot().attemptId, done.progress.attemptId);
  assert.deepEqual(h.events, []); // Unexpected network requests also throw in this harness.
  cleanup();
  assert.equal(h.listeners.get("pageshow").size, 0);
  assert.equal(h.listeners.get("popstate").size, 0);
});

test("empty or corrupt TestRunner history offers explicit start instead of creating an attempt", () => {
  for (const raw of [null, "broken-json"]) {
    const h = runnerHarness();
    if (raw) h.window.localStorage.setItem(h.load("src/lib/testProgress.ts").TEST_STORAGE_KEY, raw);
    h.initialize();
    assert.equal(h.state[0], null);
    assert.equal(h.state[7], true);
    assert.ok(h.state[4]);
    assert.deepEqual(h.routes, []);
  }
});

test("in-progress history keeps the same answers, credentials and resume screen", () => {
  const h = runnerHarness();
  const lib = h.load("src/lib/testProgress.ts");
  const question = h.load("src/data/questionOrder.ts").orderedQuestions[0];
  const attempt = lib.moveQuestion(lib.selectAnswer(lib.createAttempt(randomUUID()), question.choices[0].id), 1);
  lib.saveAttempt(h.window.localStorage, attempt);
  h.window.localStorage.setItem(h.load("src/lib/attemptCredentials.ts").CREDENTIAL_STORAGE_KEY,
    JSON.stringify({ attemptId: attempt.attemptId, startedAt: attempt.startedAt, writeToken: "A".repeat(43) }));
  h.initialize();
  assert.deepEqual(h.state[0], attempt);
  assert.equal(h.state[1], "resume");
  assert.deepEqual(h.routes, []);
});

test("real completion replaces the test history entry; back/forward and refresh restore the same result", async () => {
  const h = answerSetup();
  const b = browser(h, "/test");
  for (const question of h.questions) {
    h.render().handleSelect(question.choices[0].id);
    await h.render().handleNext();
  }
  // The real handler's router mock supports replace; verify its destination,
  // then apply that replacement to the browser history model.
  assert.equal(h.state.route, "/result");
  b.history.replace(h.state.route);
  const store = h.load("src/lib/resultSnapshot.ts");
  const off = store.subscribeToResult(() => {});
  const expected = store.getResultSnapshot();
  const requestCount = h.requests.length;
  const raw = h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY);
  b.history.go(-1);
  assert.equal(h.window.location.pathname, "/");
  b.history.go(1);
  assert.deepEqual(store.getResultSnapshot(), expected);
  b.emit("pageshow", { persisted: true });
  assert.deepEqual(store.getResultSnapshot(), expected);
  const reload = createHarness({ localStorage: h.window.localStorage, sessionStorage: h.window.sessionStorage });
  browser(reload);
  reload.window.history.replaceState(b.history.state);
  assert.deepEqual(reload.load("src/lib/resultSnapshot.ts").getResultSnapshot(), expected);
  assert.equal(h.requests.length, requestCount);
  assert.equal(h.calls.filter(call => call === "complete").length, 1);
  assert.equal(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY), raw);
  off();
});

test("stale question handlers cannot answer, complete or restart a completed attempt", async () => {
  const h = answerSetup();
  const stale = h.render();
  const done = completed(h, h.state.progress.attemptId);
  const raw = JSON.stringify(done.progress);
  stale.handleSelect(h.questions[0].choices[0].id);
  await stale.handleNext();
  await stale.handleRestart();
  assert.equal(h.requests.length, 0);
  assert.equal(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY), raw);
  assert.deepEqual(h.calls, []);
});

test("explicit retry preserves multiple completed history entries across new starts and reload", async () => {
  const requests = [];
  const h = createHarness({ fetch: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ attempt_id: randomUUID(), write_token: "A".repeat(43) }, { status: 201 });
  } });
  const b = browser(h);
  const a = completed(h);
  const store = h.load("src/lib/resultSnapshot.ts");
  let off = store.subscribeToResult(() => {});
  const stateA = b.history.state;
  const start = h.load("src/lib/startDatabaseAttempt.ts").startDatabaseAttempt;
  const next = await start(true);
  assert.notEqual(next.attemptId, a.progress.attemptId);
  assert.deepEqual(next.answers, []);
  assert.equal(store.getResultSnapshot().attemptId, a.progress.attemptId);
  assert.ok(!JSON.stringify(stateA).includes(a.progress.attemptId));
  assert.equal(stateA.__NA, true);
  off();
  b.history.push("/test");
  const second = completed(h, next.attemptId, 1);
  b.history.replace("/result");
  off = store.subscribeToResult(() => {});
  assert.equal(store.getResultSnapshot().attemptId, second.progress.attemptId);
  b.history.go(-1);
  assert.equal(store.getResultSnapshot().attemptId, a.progress.attemptId);
  const reload = createHarness({ localStorage: h.window.localStorage, sessionStorage: h.window.sessionStorage });
  browser(reload);
  reload.window.history.replaceState(stateA);
  assert.deepEqual(reload.load("src/lib/resultSnapshot.ts").getResultSnapshot().result, a.result);
  b.history.go(1);
  assert.deepEqual(store.getResultSnapshot().result, second.result);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].is_retry, true);
  off();
});

test("archive write failure stops issuance and keeps the completed attempt intact", async () => {
  const h = createHarness();
  const done = completed(h);
  h.window.sessionStorage.setItem = () => { throw new Error("quota"); };
  await assert.rejects(h.load("src/lib/startDatabaseAttempt.ts").startDatabaseAttempt(true), /START_FAILED/);
  assert.deepEqual(h.load("src/lib/testProgress.ts").restoreAttempt(
    h.window.localStorage.getItem(h.load("src/lib/testProgress.ts").TEST_STORAGE_KEY)).progress, done.progress);
});

test("missing/corrupt bound results have stable fallback, never show a newer attempt or create one", () => {
  const h = createHarness();
  browser(h);
  completed(h);
  const store = h.load("src/lib/resultSnapshot.ts");
  const off = store.subscribeToResult(() => {});
  h.window.sessionStorage.removeItem("pubg-playstyle-test:completed-results");
  assert.equal(store.getResultSnapshot().status, "missing");
  h.window.sessionStorage.setItem("pubg-playstyle-test:completed-results", "invalid-json");
  assert.equal(store.getResultSnapshot().status, "error");
  assert.equal(store.getResultSnapshot(), store.getResultSnapshot());
  off();
});

test("shared result routes never bind or replace browser history", () => {
  const h = createHarness();
  const b = browser(h, "/share/invalid");
  completed(h);
  const before = JSON.stringify(b.entries);
  h.load("src/lib/resultHistory.ts").bindResultHistory();
  assert.equal(JSON.stringify(b.entries), before);
  b.history.go(-1);
  assert.equal(h.window.location.pathname, "/");
});

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}

test("landing CTA starts once after completion, preserves attribution and emits no retry_click", async () => {
  const requests = [], routes = [], pending = [];
  const h = createHarness({ href: "https://example.invalid/?utm_source=original", fetch: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ attempt_id: randomUUID(), write_token: "A".repeat(43) }, { status: 201 });
  }, mocks: {
    react: { useEffect() {}, useState: value => [value, () => {}], useRef: value => ({ current: value }),
      useTransition: () => [false, fn => pending.push(fn())] },
    "next/navigation": { useRouter: () => ({ push: path => routes.push(path) }) },
  } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const context = h.load("src/lib/visitorContext.ts").getVisitorContext();
  browser(h);
  const done = completed(h);
  h.load("src/lib/resultHistory.ts").bindResultHistory();
  const oldState = h.window.history.state;
  h.window.location.pathname = "/";
  const Component = h.load("src/components/LandingContent.tsx").default;
  const link = nodes(Component()).find(node => node.props?.href === "/test");
  link.props.onClick({ preventDefault() {} });
  link.props.onNavigate({ preventDefault() {} });
  link.props.onNavigate({ preventDefault() {} });
  await Promise.all(pending);
  assert.deepEqual(routes, ["/test"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].is_retry, false);
  assert.equal(requests[0].initial_source, context.initial_source);
  assert.equal(requests[0].anonymous_id, context.anonymous_id);
  assert.deepEqual(h.events.map(event => event.name), ["cta_click", "test_start"]);
  const next = h.load("src/lib/testProgress.ts").restoreAttempt(
    h.window.localStorage.getItem(h.load("src/lib/testProgress.ts").TEST_STORAGE_KEY)).progress;
  assert.notEqual(next.attemptId, done.progress.attemptId);
  assert.deepEqual(next.answers, []);
  // The old result history entry still selects the old answers after a fresh start.
  h.window.location.pathname = "/result";
  h.window.history.replaceState(oldState);
  assert.deepEqual(h.load("src/lib/resultSnapshot.ts").getResultSnapshot().result, done.result);
});

test("landing CTA resumes unfinished answers without issuance or another test_start", async () => {
  const pending = [], routes = [];
  const h = createHarness({ mocks: {
    react: { useEffect() {}, useState: value => [value, () => {}], useRef: value => ({ current: value }),
      useTransition: () => [false, fn => pending.push(fn())] },
    "next/navigation": { useRouter: () => ({ push: path => routes.push(path) }) },
  } });
  const lib = h.load("src/lib/testProgress.ts");
  const attempt = lib.createAttempt(randomUUID());
  lib.saveAttempt(h.window.localStorage, attempt);
  const link = nodes(h.load("src/components/LandingContent.tsx").default()).find(node => node.props?.href === "/test");
  link.props.onNavigate({ preventDefault() {} });
  await Promise.all(pending);
  assert.deepEqual(routes, ["/test"]);
  assert.deepEqual(lib.restoreAttempt(h.window.localStorage.getItem(lib.TEST_STORAGE_KEY)).progress, attempt);
});

test("result_view remains once per mounted view; history restoration emits no start/complete", async () => {
  const refs = [], effects = [];
  let index = 0;
  const h = createHarness({ mocks: {
    react: { useState: value => [value, () => {}], useRef: value => refs[index++] ?? (refs[index - 1] = { current: value }),
      useSyncExternalStore: (_, get) => get(), useEffect: fn => effects.push(fn) },
    "next/navigation": { useRouter: () => ({}) },
  } });
  const b = browser(h);
  completed(h);
  h.load("src/lib/resultHistory.ts").bindResultHistory();
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const Component = h.load("src/components/ResultPreview.tsx").default;
  Component();
  const cleanup = effects[0]();
  effects[1]();
  b.history.go(-1);
  b.history.go(1);
  b.emit("pageshow", { persisted: true });
  index = 0; effects.length = 0;
  Component(); effects[1]();
  assert.deepEqual(h.events.map(event => event.name), ["result_view"]);
  cleanup();
});
