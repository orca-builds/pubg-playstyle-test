import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setup, saved, tick, token } from "./helpers/answerQueueHarness.mjs";

test("selection advances and tracks local answer before a slow API resolves; rapid questions drain serially", async () => {
  const pending = [], rows = new Map();
  const h = setup({ fetch: (url, init) => new Promise(resolve => {
    pending.push(() => { const body = JSON.parse(init.body); rows.set(body.question_id, body.answer_id); resolve(saved(init)); });
  }) });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  for (let i = 0; i < 5; i++) {
    h.render().handleSelect(h.questions[i].choices[0].id);
    assert.equal(h.state.progress.currentQuestionIndex, i + 1);
    assert.equal(h.state.progress.answers.length, i + 1);
    assert.equal(h.requests.length, 1);
  }
  const events = h.events.filter(event => event.name === "question_answer");
  assert.equal(events.length, 5);
  events.forEach((event, i) => {
    const id = h.questions[i].choices[0].id;
    assert.equal(event.properties.answer_id, id);
    assert.equal(event.properties.attempt_id, h.state.progress.attemptId);
    assert.equal(event.properties.display_position, h.state.progress.choiceDisplayOrder[h.questions[i].id].indexOf(id) + 1);
    assert.equal(event.properties.display_label, String.fromCharCode(64 + event.properties.display_position));
    assert.equal(event.properties.answer_saved, true);
  });
  for (let i = 0; i < 5; i++) {
    assert.equal(pending.length, 1); // A later request cannot finish first: it has not been sent.
    pending.shift()();
    await tick();
  }
  await h.settle();
  assert.equal(h.state.answerStatus, "ready");
  assert.equal(rows.size, 5);
  assert.deepEqual(h.requests.map(({ init }) => JSON.parse(init.body).question_index), [1, 2, 3, 4, 5]);
  assert.ok(!JSON.stringify(h.events).includes(token));
  assert.ok(!JSON.stringify(h.state).includes(token));
  assert.ok(!h.window.localStorage.getItem(h.sync.ANSWER_SYNC_KEY).includes(token));
});

test("in-flight old answer finishes before latest changed answer; unsent changes coalesce", async () => {
  const pending = [], rows = new Map();
  const h = setup({ fetch: (url, init) => new Promise(resolve => pending.push(() => {
    const body = JSON.parse(init.body); rows.set(body.question_id, body.answer_id); resolve(saved(init));
  })) });
  const [a, b] = h.questions[0].choices.map(choice => choice.id);
  h.render().handleSelect(a);
  h.back(); h.render().handleSelect(b);
  h.back(); h.render().handleSelect(a);
  h.back(); h.render().handleSelect(b);
  assert.equal(h.requests.length, 1);
  pending.shift()(); await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(JSON.parse(h.requests[1].init.body).answer_id, b);
  pending.shift()(); await h.settle();
  assert.equal(rows.get(h.questions[0].id), b);
  assert.equal(h.sync.hasUnsyncedAnswers(h.window.localStorage, h.state.progress), false);
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  assert.equal(h.events.filter(event => event.name === "answer_change").length, 3);
});

test("Q3 change after Q4 preserves all other queued questions and latest server answer", async () => {
  const pending = [], rows = new Map();
  const h = setup({ fetch: (url, init) => new Promise(resolve => pending.push(() => {
    const body = JSON.parse(init.body); rows.set(body.question_id, body.answer_id); resolve(saved(init));
  })) });
  for (let i = 0; i < 3; i++) h.render().handleSelect(h.questions[i].choices[0].id);
  h.back(); h.render().handleSelect(h.questions[2].choices[1].id);
  for (let i = 0; i < 3; i++) { pending.shift()(); await tick(); }
  await h.settle();
  assert.equal(rows.size, 3);
  assert.equal(rows.get(h.questions[2].id), h.questions[2].choices[1].id);
  assert.equal(h.requests.length, 3);
});

test("failed background save pauses queue but allows questions; explicit retry sends latest without analytics duplication", async () => {
  for (const status of [403, 404, 409, 500]) {
    let fail = true;
    const h = setup({ fetch: async (url, init) => fail ? Response.json({ error: token }, { status }) : saved(init) });
    h.render().handleSelect(h.questions[0].choices[0].id);
    await h.settle();
    assert.equal(h.state.answerStatus, "error");
    h.render().handleSelect(h.questions[1].choices[0].id);
    await tick();
    assert.equal(h.state.progress.currentQuestionIndex, 2);
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.answerStatus, "error");
    fail = false;
    assert.equal(await h.render().persistAnswers(h.state.progress, true), true);
    assert.equal(h.state.answerStatus, "ready");
    assert.equal(h.requests.length, 3);
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    assert.equal(h.events.filter(event => event.name === "question_answer").length, 2);
  }
});

test("reload restores latest local answers, index, attempt and display order and reconciles only unacknowledged answers", async () => {
  let fail = false;
  const h = setup({ fetch: async (url, init) => { if (fail) throw new Error("lost response"); return saved(init); } });
  h.render().handleSelect(h.questions[0].choices[0].id); await h.settle();
  fail = true;
  h.render().handleSelect(h.questions[1].choices[0].id); await h.settle();
  const reload = setup({ localStorage: h.window.localStorage });
  assert.deepEqual(reload.state.progress, h.state.progress);
  assert.equal(reload.state.answerStatus, "pending");
  await reload.render().persistAnswers(reload.state.progress, true);
  assert.equal(reload.requests.length, 1);
  assert.equal(reload.requests[0].url, `/api/attempts/${h.state.progress.attemptId}/answers`);
  assert.equal(JSON.parse(reload.requests[0].init.body).question_index, 2);
  assert.equal(reload.state.answerStatus, "ready");
  const again = setup({ localStorage: reload.window.localStorage });
  await again.render().persistAnswers(again.state.progress, true);
  assert.equal(again.requests.length, 0);
});

test("lost response followed by returning to original answer still sends that answer on retry", async () => {
  let fail = false;
  const h = setup({ fetch: async (url, init) => { if (fail) throw new Error("lost response"); return saved(init); } });
  const [a, b] = h.questions[0].choices.map(choice => choice.id);
  h.render().handleSelect(a); await h.settle();
  fail = true;
  h.back(); h.render().handleSelect(b); await h.settle();
  h.back(); h.render().handleSelect(a); await tick();
  fail = false;
  await h.render().persistAnswers(h.state.progress, true);
  assert.equal(h.requests.length, 3);
  assert.equal(JSON.parse(h.requests[2].init.body).answer_id, a);
});

test("Q24 waits for all 24 acknowledgements before scoring/complete/result, including double clicks", async () => {
  const pending = [];
  const h = setup({ fetch: (url, init) => new Promise(resolve => pending.push(() => resolve(saved(init)))) });
  for (const question of h.questions) h.render().handleSelect(question.choices[0].id);
  assert.equal(h.state.progress.answers.length, 24);
  assert.equal(h.state.navigating, true);
  assert.deepEqual(h.calls, []);
  await h.render().handleNext();
  for (let i = 0; i < 24; i++) {
    assert.deepEqual(h.calls, []);
    pending.shift()(); await tick();
  }
  assert.deepEqual(h.calls, ["calculate", "complete"]);
  assert.equal(h.requests.length, 24);
  assert.equal(h.state.route, "/result");
  const stored = h.progressLib.restoreAttempt(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY));
  assert.equal(stored.kind, "completed");
  assert.deepEqual(h.completionDraft.current.result, h.load("src/lib/scoring.ts").calculateScore(h.state.progress.answers));
});

test("unresolved save failure never calculates or completes; final retry drains remaining answers", async () => {
  let fail = true;
  const h = setup({ fetch: async (url, init) => fail && JSON.parse(init.body).question_index === 3 ?
    new Response(null, { status: 500 }) : saved(init) });
  for (const question of h.questions) h.render().handleSelect(question.choices[0].id);
  await tick();
  assert.equal(h.state.answerStatus, "error");
  assert.equal(h.state.completionPending, false);
  assert.equal(h.state.navigating, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.state.route, "");
  fail = false;
  await h.render().handleNext();
  assert.deepEqual(h.calls, ["calculate", "complete"]);
  assert.deepEqual(h.requests.map(({ init }) => JSON.parse(init.body).question_index), [1, 2, 3, ...Array.from({ length: 22 }, (_, i) => i + 3)]);
  assert.equal(h.state.route, "/result");
});

test("new attempt retires old queue; its delayed response cannot affect new acknowledgements or UI", async () => {
  let resolveOld;
  const newId = randomUUID();
  const h = setup({ fetch: (url, init) => {
    if (url === "/api/attempts/start") return Promise.resolve(Response.json({ attempt_id: newId, write_token: "B".repeat(42) + "A" }, { status: 201 }));
    if (url.includes(newId)) return Promise.resolve(saved(init));
    return new Promise(resolve => { resolveOld = () => resolve(saved(init)); });
  } });
  h.render().handleSelect(h.questions[0].choices[0].id);
  h.render().handleSelect(h.questions[1].choices[0].id);
  const oldId = h.state.progress.attemptId;
  const next = await h.load("src/lib/startDatabaseAttempt.ts").startDatabaseAttempt(true);
  h.activeAttempt.current = next.attemptId;
  h.state.progress = next;
  h.render().handleSelect(h.questions[0].choices[1].id);
  await h.settle();
  const ack = h.window.localStorage.getItem(h.sync.ANSWER_SYNC_KEY);
  resolveOld(); await tick();
  assert.equal(h.state.answerStatus, "ready");
  assert.equal(h.window.localStorage.getItem(h.sync.ANSWER_SYNC_KEY), ack);
  assert.equal(h.requests.filter(request => request.url.includes(oldId)).length, 1);
  assert.equal(JSON.parse(ack).attemptId, newId);
});

test("local progress failure prevents advancement; acknowledgement write failure allows progress but blocks completion", async () => {
  for (const mode of ["progress", "ack"]) {
    const h = setup();
    const storage = h.window.localStorage, setItem = storage.setItem;
    let ackWrites = 0;
    storage.setItem = (key, value) => {
      if (key === h.sync.ANSWER_SYNC_KEY) ackWrites++;
      if ((mode === "progress" && key === h.progressLib.TEST_STORAGE_KEY) ||
          (mode === "ack" && key === h.sync.ANSWER_SYNC_KEY && ackWrites > 1)) throw new Error("quota");
      setItem(key, value);
    };
    h.render().handleSelect(h.questions[0].choices[0].id);
    await tick();
    assert.equal(h.state.progress.currentQuestionIndex, mode === "progress" ? 0 : 1);
    if (mode === "progress") { assert.equal(h.requests.length, 0); assert.ok(h.state.error); }
    else { assert.equal(h.state.answerStatus, "error"); assert.deepEqual(h.calls, []); }
  }
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

test("an enqueue while an empty worker settles is not lost", async () => {
  const h = setup();
  const empty = h.sync.syncDatabaseAnswers(h.state.progress);
  const answered = h.progressLib.selectAnswer(h.state.progress, h.questions[0].choices[0].id);
  const queued = h.sync.syncDatabaseAnswers(answered);
  assert.equal(empty, queued);
  await queued;
  assert.equal(h.requests.length, 1);
  assert.equal(h.sync.hasUnsyncedAnswers(h.window.localStorage, answered), false);
});

test("unmount during final drain preserves local progress and never completes or navigates", async () => {
  let resolve;
  const h = setup({ fetch: (url, init) => new Promise(done => { resolve = () => done(saved(init)); }) });
  for (const question of h.questions) h.render().handleSelect(question.choices[0].id);
  h.mounted.current = false;
  for (let i = 0; i < 24; i++) { resolve(); await tick(); }
  assert.deepEqual(h.calls, []);
  assert.equal(h.state.route, "");
  assert.equal(h.progressLib.restoreAttempt(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY)).kind, "in_progress");
});
