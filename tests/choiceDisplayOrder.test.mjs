import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

function setup(options = {}) {
  const h = createHarness(options);
  return { ...h, progress: h.load("src/lib/testProgress.ts"),
    display: h.load("src/lib/choiceDisplayOrder.ts"),
    questions: h.load("src/data/questionOrder.ts").orderedQuestions };
}

test("new attempts contain 24 balanced pairs without mutating source choices", () => {
  const h = setup();
  const source = JSON.stringify(h.questions);
  for (const random of [() => 0, () => 0.999, Math.random]) {
    const order = h.display.createChoiceDisplayOrder(random);
    assert.equal(h.display.isChoiceDisplayOrder(order), true);
    assert.equal(Object.keys(order).length, 24);
    assert.equal(h.questions.filter(q => order[q.id][0] === q.choices[0].id).length, 12);
    assert.equal(h.questions.filter(q => order[q.id][0] === q.choices[1].id).length, 12);
  }
  assert.notDeepEqual(h.display.createChoiceDisplayOrder(() => 0), h.display.createChoiceDisplayOrder(() => 0.999));
  assert.equal(JSON.stringify(h.questions), source);
  assert.equal(h.display.isChoiceDisplayOrder(h.progress.createAttempt("new").choiceDisplayOrder), true);
});

test("reload, back, answer changes and completion preserve the same attempt order", () => {
  const h = setup();
  let p = h.progress.createAttempt("stable");
  const original = structuredClone(p.choiceDisplayOrder);
  p = h.progress.selectAnswer(p, h.questions[0].choices[0].id);
  p = h.progress.moveQuestion(p, 1);
  p = h.progress.moveQuestion(p, -1);
  p = h.progress.selectAnswer(p, h.questions[0].choices[1].id);
  h.progress.saveAttempt(h.window.localStorage, p);
  const reload = setup({ localStorage: h.window.localStorage });
  p = reload.progress.restoreAttempt(h.window.localStorage.getItem(h.progress.TEST_STORAGE_KEY)).progress;
  assert.deepEqual(p.choiceDisplayOrder, original);
  for (const q of h.questions) {
    p = h.progress.selectAnswer(p, q.choices[0].id);
    p = h.progress.moveQuestion(p, 1);
  }
  const done = h.progress.finishAttempt(p);
  assert.deepEqual(h.progress.restoreAttempt(JSON.stringify(done.progress)).progress.choiceDisplayOrder, original);
  const alternate = { ...p, choiceDisplayOrder: h.display.createChoiceDisplayOrder(() => 0) };
  assert.deepEqual(h.progress.finishAttempt(alternate).result, done.result);
});

test("legacy attempts keep original A/B; malformed stored orders fail closed without reshuffling", () => {
  const h = setup();
  const p = h.progress.createAttempt("legacy");
  delete p.choiceDisplayOrder;
  const restored = h.progress.restoreAttempt(JSON.stringify(p)).progress;
  assert.equal(restored.choiceDisplayOrder, undefined);
  for (const q of h.questions) assert.deepEqual(h.display.getDisplayedChoices(q, restored.choiceDisplayOrder), q.choices);
  const valid = h.display.createChoiceDisplayOrder();
  for (const order of [null, {}, [], { ...valid, q01: ["q01-choice-1", "q01-choice-1"] },
    { ...valid, q01: ["q02-choice-1", "q02-choice-2"] }, { ...valid, extra: [] }]) {
    assert.equal(h.progress.restoreAttempt(JSON.stringify({ ...p, choiceDisplayOrder: order })).kind, "invalid");
  }
});

test("actual card clicks match displayed labels, analytics positions and DB internal answer IDs", async () => {
  const requests = [];
  const h = setup({ fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ saved: true, last_question_index: 24 });
  } });
  const Card = h.load("src/components/QuestionCard.tsx").default;
  const tracking = h.load("src/lib/testAnalytics.ts");
  const p = h.progress.createAttempt("00000000-0000-4000-8000-000000000001");
  const credentials = h.load("src/lib/attemptCredentials.ts");
  h.window.localStorage.setItem(credentials.CREDENTIAL_STORAGE_KEY, JSON.stringify({ attemptId: p.attemptId, startedAt: p.startedAt, writeToken: "A".repeat(43) }));
  for (const [index, question] of h.questions.entries()) {
    const attempt = { ...p, currentQuestionIndex: index };
    let selected;
    const tree = Card({ question, displayOrder: p.choiceDisplayOrder, onSelect: id => { selected = id; } });
    const buttons = tree.props.children[1].props.children;
    for (const [position, button] of buttons.entries()) {
      assert.equal(button.props.children[0].props.children.join(""), position === 0 ? "A." : "B.");
      button.props.onClick();
      assert.equal(selected, p.choiceDisplayOrder[question.id][position]);
      tracking.trackAnswer(attempt, selected, true);
      await h.load("src/lib/syncDatabaseAnswers.ts").syncDatabaseAnswers(h.progress.selectAnswer(attempt, selected));
      const body = requests.at(-1).body;
      assert.equal(body.answer_id, selected);
      assert.deepEqual(Object.keys(body).sort(), ["answer_id", "question_id", "question_index", "write_token"]);
    }
  }
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  assert.equal(h.events.length, 48);
  h.events.forEach(({ properties }, i) => {
    assert.equal(properties.answer_id, requests[i].body.answer_id);
    assert.equal(properties.display_position, i % 2 + 1);
    assert.equal(properties.display_label, i % 2 === 0 ? "A" : "B");
  });
});

test("retry start generates a fresh order; pending issuance persistence retry reuses its order", async () => {
  let generations = 0;
  const real = setup().display;
  let requests = 0;
  const h = setup({ mocks: { "@/lib/choiceDisplayOrder": { ...real,
    createChoiceDisplayOrder: () => real.createChoiceDisplayOrder(++generations === 1 ? () => 0 : () => 0.999),
  } }, fetch: async () => Response.json({
    attempt_id: `00000000-0000-4000-8000-${String(++requests).padStart(12, "0")}`, write_token: "A".repeat(43),
  }, { status: 201 }) });
  const start = h.load("src/lib/startDatabaseAttempt.ts").startDatabaseAttempt;
  const first = await start();
  const storage = h.window.localStorage;
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { if (key === h.progress.TEST_STORAGE_KEY) throw Error("quota"); setItem(key, value); };
  await assert.rejects(start(true));
  assert.equal(generations, 2);
  storage.setItem = setItem;
  const retry = await start(true);
  assert.equal(generations, 2);
  assert.equal(requests, 2);
  assert.notEqual(first.attemptId, retry.attemptId);
  assert.notDeepEqual(first.choiceDisplayOrder, retry.choiceDisplayOrder);
  assert.deepEqual(h.progress.restoreAttempt(storage.getItem(h.progress.TEST_STORAGE_KEY)).progress.choiceDisplayOrder, retry.choiceDisplayOrder);
});
