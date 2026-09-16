import assert from "node:assert/strict";
import test from "node:test";
import { setup, saved, tick } from "./helpers/answerQueueHarness.mjs";

function observe(h) {
  const enqueues = [], writes = [];
  const sync = h.sync.syncDatabaseAnswers;
  h.sync.syncDatabaseAnswers = (...args) => { enqueues.push(args[0]); return sync(...args); };
  const storage = h.window.localStorage;
  const set = storage.setItem;
  storage.setItem = (key, value) => { writes.push([key, value]); set(key, value); };
  return { enqueues, writes };
}

function repeatWithoutEffects(h, counters, id, count = 5) {
  const progress = h.state.progress;
  const state = { ...h.state };
  const before = [counters.enqueues.length, counters.writes.length, h.events.length, h.requests.length];
  for (let i = 0; i < count; i++) h.render().handleSelect(id);
  assert.equal(h.state.progress, progress);
  assert.deepEqual(h.state, state);
  assert.deepEqual([counters.enqueues.length, counters.writes.length, h.events.length, h.requests.length], before);
  assert.equal(h.progressLib.canGoNext(h.state.progress), true);
}

for (const reversed of [false, true]) {
  test(`first/change/repeated card clicks preserve queue and internal IDs (reversed=${reversed})`, async () => {
    const pending = [], server = new Map();
    const h = setup({ fetch: (url, init) => new Promise(resolve => pending.push(() => {
      const body = JSON.parse(init.body);
      server.set(body.question_id, body.answer_id);
      resolve(saved(init));
    })) });
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    const counters = observe(h);
    const question = h.questions[0];
    const ids = question.choices.map(c => c.id);
    const [a, b] = reversed ? [...ids].reverse() : ids;
    h.state.progress = { ...h.state.progress, choiceDisplayOrder: {
      ...h.state.progress.choiceDisplayOrder, [question.id]: [a, b],
    } };
    const Card = h.load("src/components/QuestionCard.tsx").default;
    function click(position) {
      const card = Card({ question, displayOrder: h.state.progress.choiceDisplayOrder,
        selectedChoiceId: h.state.progress.answers[0]?.choiceId, onSelect: h.render().handleSelect });
      card.props.children[1].props.children[position].props.onClick();
    }
    assert.equal(h.progressLib.canGoNext(h.state.progress), false);
    click(0);
    assert.equal(counters.enqueues.length, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.progress.currentQuestionIndex, 0);
    assert.equal(JSON.parse(h.window.localStorage.getItem(h.progressLib.TEST_STORAGE_KEY)).answers[0].choiceId, a);
    assert.deepEqual(h.events.map(e => e.name), ["question_answer"]);
    assert.equal(h.events[0].properties.answer_id, a);
    assert.equal(h.events[0].properties.display_label, "A");
    repeatWithoutEffects(h, counters, a);
    click(1); // Change while A is still saving: B must remain the latest pending answer.
    assert.equal(counters.enqueues.length, 2);
    assert.equal(counters.enqueues[1].answers[0].choiceId, b);
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.events.map(e => e.name), ["question_answer", "question_answer", "answer_change"]);
    repeatWithoutEffects(h, counters, b);
    pending.shift()(); await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(JSON.parse(h.requests[1].init.body).answer_id, b);
    pending.shift()(); await tick();
    assert.equal(server.get(question.id), b);
    assert.equal(h.sync.hasUnsyncedAnswers(h.window.localStorage, h.state.progress), false);
    repeatWithoutEffects(h, counters, b);
    await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(h.events.filter(e => e.name === "answer_change").length, 1);
  });
}

test("Q3 previous and refresh retain same-answer no-op but allow a different answer", async () => {
  let h = setup();
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  for (let i = 0; i < 3; i++) {
    h.render().handleSelect(h.questions[i].choices[0].id);
    await tick();
    await h.render().handleNext();
  }
  assert.equal(h.state.progress.currentQuestionIndex, 3);
  h.back();
  const [a, b] = h.questions[2].choices.map(c => c.id);
  repeatWithoutEffects(h, observe(h), a);
  h.render().handleSelect(b); await tick();
  assert.equal(h.events.filter(e => e.name === "answer_change").length, 1);
  assert.equal(JSON.parse(h.requests.at(-1).init.body).answer_id, b);
  h = setup({ localStorage: h.window.localStorage });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  assert.equal(h.state.progress.currentQuestionIndex, 2);
  repeatWithoutEffects(h, observe(h), b);
  assert.equal(h.requests.length, 0);
});

test("failed background save is not re-enqueued by same answer; explicit retry still works", async () => {
  let fail = true;
  const h = setup({ fetch: (url, init) => fail ? Response.json({}, { status: 500 }) : saved(init) });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const counters = observe(h);
  const a = h.questions[0].choices[0].id;
  h.render().handleSelect(a); await tick();
  assert.equal(h.state.answerStatus, "error");
  repeatWithoutEffects(h, counters, a);
  fail = false;
  await h.render().persistAnswers(h.state.progress, true);
  assert.equal(h.state.answerStatus, "ready");
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.events.map(e => e.name), ["question_answer"]);
});
