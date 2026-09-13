import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setup, saved, tick, token } from "./helpers/answerQueueHarness.mjs";

test("restart drains seven local answers after four server saves before retry event and new empty attempt", async () => {
  const pending = [], rows = new Map();
  const newId = randomUUID();
  const h = setup({ fetch: (url, init) => {
    if (url === "/api/attempts/start") {
      assert.equal(rows.size, 7);
      assert.equal(h.events.filter(e => e.name === "retry_click").length, 1);
      return Response.json({ attempt_id: newId, write_token: token }, { status: 201 });
    }
    return new Promise(resolve => pending.push(() => {
      const body = JSON.parse(init.body);
      rows.set(body.question_id, body.answer_id);
      resolve(saved(init));
    }));
  } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  for (let i = 0; i < 7; i++) {
    h.render().handleSelect(h.questions[i].choices[0].id);
    await h.render().handleNext();
  }
  for (let i = 0; i < 4; i++) { pending.shift()(); await tick(); }
  const old = h.state.progress;
  const restarting = h.render().handleRestart();
  await h.render().handleRestart();
  h.render().handleSelect(h.questions[7].choices[0].id);
  await h.render().handleNext();
  assert.deepEqual(h.state.progress, old);
  assert.equal(h.state.restarting, true);
  assert.equal(h.requests.filter(r => r.url === "/api/attempts/start").length, 0);
  assert.equal(h.events.filter(e => e.name === "retry_click").length, 0);
  for (let i = 4; i < 7; i++) { pending.shift()(); await tick(); }
  await restarting;
  assert.equal(h.state.restarting, false);
  assert.equal(rows.size, 7);
  assert.equal(h.requests.filter(r => r.url === "/api/attempts/start").length, 1);
  assert.ok(h.requests.filter(r => r.url.endsWith("/answers")).every(r => r.url.includes(old.attemptId)));
  assert.deepEqual(h.events.filter(e => ["retry_click", "test_start"].includes(e.name)).map(e => [e.name, e.properties.attempt_id]),
    [["retry_click", old.attemptId], ["test_start", newId]]);
  assert.equal(h.state.progress.attemptId, newId);
  assert.deepEqual(h.state.progress.answers, []);
  assert.equal(h.state.progress.currentQuestionIndex, 0);
  const restored = h.progressLib.restoreAttempt(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY));
  assert.deepEqual(restored.progress, h.state.progress);
  assert.notEqual(h.state.progress.choiceDisplayOrder, old.choiceDisplayOrder);
  assert.equal(pending.length, 0);
});

test("failed restart retains progress and credentials; retry drains latest changed answer before creating attempt", async () => {
  let fail = true;
  const rows = new Map();
  const h = setup({ fetch: (url, init) => {
    if (url === "/api/attempts/start") return Response.json({ attempt_id: randomUUID(), write_token: token }, { status: 201 });
    if (fail) return new Response(null, { status: 500 });
    const body = JSON.parse(init.body);
    rows.set(body.question_id, body.answer_id);
    return saved(init);
  } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  h.render().handleSelect(h.questions[0].choices[0].id);
  await h.settle();
  h.render().handleSelect(h.questions[0].choices[1].id);
  const old = h.state.progress;
  const credential = h.window.localStorage.getItem(h.credentials.CREDENTIAL_STORAGE_KEY);
  await h.render().handleRestart();
  assert.equal(h.state.restarting, false);
  assert.ok(h.state.error);
  assert.deepEqual(h.state.progress, old);
  assert.equal(h.window.localStorage.getItem(h.credentials.CREDENTIAL_STORAGE_KEY), credential);
  assert.equal(h.progressLib.restoreAttempt(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY)).progress.attemptId, old.attemptId);
  assert.ok(h.requests.every(r => r.url !== "/api/attempts/start"));
  assert.equal(h.events.filter(e => e.name === "retry_click").length, 0);
  fail = false;
  await h.render().handleRestart();
  assert.equal(rows.get(h.questions[0].id), h.questions[0].choices[1].id);
  assert.notEqual(h.state.progress.attemptId, old.attemptId);
  assert.deepEqual(h.state.progress.answers, []);
  assert.equal(h.events.filter(e => e.name === "answer_change").length, 1);
});

test("restart local persistence failure cannot create attempt or record retry", async () => {
  const h = setup();
  h.render().handleSelect(h.questions[0].choices[0].id);
  await h.settle();
  const old = h.state.progress;
  const setItem = h.window.localStorage.setItem;
  h.window.localStorage.setItem = (key, value) => {
    if (key === h.progressLib.TEST_STORAGE_KEY) throw new Error("quota");
    setItem(key, value);
  };
  await h.render().handleRestart();
  assert.equal(h.state.restarting, false);
  assert.deepEqual(h.state.progress, old);
  assert.ok(h.state.error);
  assert.ok(h.requests.every(r => r.url !== "/api/attempts/start"));
});

test("unmount during restart drain saves old answers but does not create a new attempt", async () => {
  let resolve;
  const h = setup({ fetch: (url, init) => new Promise(done => { resolve = () => done(saved(init)); }) });
  h.render().handleSelect(h.questions[0].choices[0].id);
  const restarting = h.render().handleRestart();
  h.mounted.current = false;
  resolve();
  await restarting;
  assert.equal(h.requests.length, 1);
  assert.equal(h.sync.hasUnsyncedAnswers(h.window.localStorage, h.state.progress), false);
});

test("restart joining an in-flight failed request keeps old answers and can retry", async () => {
  let rejectSave;
  let fail = true;
  const h = setup({ fetch: (url, init) => {
    if (url === "/api/attempts/start") return Response.json({ attempt_id: randomUUID(), write_token: token }, { status: 201 });
    if (fail) return new Promise(resolve => { rejectSave = () => resolve(new Response(null, { status: 500 })); });
    return saved(init);
  } });
  h.render().handleSelect(h.questions[0].choices[0].id);
  h.render().handleSelect(h.questions[0].choices[1].id);
  const old = h.state.progress;
  const restarting = h.render().handleRestart();
  rejectSave(); await restarting;
  assert.deepEqual(h.state.progress, old);
  assert.ok(h.state.error);
  assert.equal(h.requests.length, 1);
  fail = false;
  await h.render().handleRestart();
  assert.equal(JSON.parse(h.requests[1].init.body).answer_id, h.questions[0].choices[1].id);
  assert.equal(h.requests[2].url, "/api/attempts/start");
});

test("restart after an ambiguous complete response does not write answers again", async () => {
  const h = setup({ fetch: (url, init) => url === "/api/attempts/start" ?
    Response.json({ attempt_id: randomUUID(), write_token: token }, { status: 201 }) : saved(init),
    complete: async () => { throw new Error("lost response"); } });
  for (const [i, question] of h.questions.entries()) {
    h.render().handleSelect(question.choices[0].id);
    if (i < 23) await h.render().handleNext();
  }
  await h.render().handleNext();
  assert.equal(h.state.completionPending, true);
  const count = h.requests.length;
  await h.render().handleRestart();
  assert.equal(h.requests.length, count + 1);
  assert.equal(h.requests.at(-1).url, "/api/attempts/start");
  assert.deepEqual(h.state.progress.answers, []);
});
