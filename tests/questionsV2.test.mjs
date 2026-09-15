import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const h = createHarness();
const { questionSet, testVersion } = h.load("src/data/questions.ts");
const { calculateScore } = h.load("src/lib/scoring.ts");
// Approved request text, including line breaks, and its explicit score mappings.
const approved = JSON.parse(readFileSync(new URL("./fixtures/questions-v2.json", import.meta.url), "utf8"));
const mainPairs = [["combat", "position"], ["frontline", "support"], ["pressure", "design"], ["risk", "safe"]];
const subPairs = [
  ["mainBodyFlank", "mainBody", "flank", [11, 13]],
  ["hotdropTail", "hotdrop", "tail", [16, 23]],
  ["fullLootFastLoot", "fullLoot", "fastLoot", [21, 24]],
  ["centerEdge", "center", "edge", [17, 19]],
  ["standardGearSpecialGear", "standardGear", "specialGear", [14, 22]],
];

test("v2 matches all 24 approved questions, wording, choice IDs and score mappings exactly", () => {
  assert.equal(testVersion, "v2");
  assert.deepEqual(questionSet, approved);
  assert.deepEqual(questionSet.questions.map(q => q.id), Array.from({ length: 24 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`));
  const ids = questionSet.questions.flatMap(q => {
    assert.deepEqual(q.choices.map(c => c.id), [`${q.id}-choice-1`, `${q.id}-choice-2`]);
    return q.choices.map(c => c.id);
  });
  assert.equal(new Set(ids).size, 48);
});

test("every main axis has exactly five questions and every support axis exactly two with no extra scores", () => {
  const totals = { main: {}, sub: {} };
  for (const [index, question] of questionSet.questions.entries()) {
    for (const [choiceIndex, choice] of question.choices.entries()) {
      const expected = {};
      if (index < 20) expected.main = { [mainPairs[Math.floor(index / 5)][choiceIndex]]: 1 };
      const pair = subPairs.find(([, , , numbers]) => numbers.includes(index + 1));
      if (pair) expected.sub = { [pair[choiceIndex + 1]]: 1 };
      assert.deepEqual(choice.scoreDelta, expected, choice.id);
      for (const [category, scores] of Object.entries(choice.scoreDelta)) {
        for (const [key, value] of Object.entries(scores)) totals[category][key] = (totals[category][key] ?? 0) + value;
      }
    }
  }
  assert.deepEqual(totals.main, Object.fromEntries(mainPairs.flat().map(key => [key, 5])));
  assert.deepEqual(totals.sub, Object.fromEntries(subPairs.flatMap(([, a, b]) => [[a, 2], [b, 2]])));
});

test("actual v2 answers produce 2:0, 1:1 and 0:2 support scores, directions and tags", () => {
  for (const [axis, first, second, numbers] of subPairs) {
    for (const indexes of [[0, 0], [0, 1], [1, 1]]) {
      // Neutralize other support axes so the tested tag is visible.
      const overrides = Object.fromEntries(subPairs.map(([, , , qs]) => [qs[1], 1]));
      numbers.forEach((n, i) => { overrides[n] = indexes[i]; });
      const answers = questionSet.questions.map((q, i) => ({ questionId: q.id, choiceId: q.choices[overrides[i + 1] ?? 0].id }));
      const result = calculateScore(answers);
      const firstScore = indexes.filter(i => i === 0).length;
      assert.equal(result.subScores[first], firstScore);
      assert.equal(result.subScores[second], 2 - firstScore);
      assert.equal(result.subAxes[axis].direction, firstScore === 1 ? "neutral" : firstScore === 2 ? first : second);
      assert.equal(result.subAxes[axis].strength, firstScore === 1 ? "neutral" : "strong");
      assert.deepEqual(result.displaySubTags, firstScore === 1 ? ["올라운더"] : [result.subAxes[axis].label, "올라운더"]);
    }
  }
});

test("new attempts and result snapshots are v2; stored v1 attempts cannot be relabeled or recalculated", () => {
  const progress = h.load("src/lib/testProgress.ts");
  const snapshots = h.load("src/lib/resultSnapshot.ts");
  let attempt = progress.createAttempt("version-regression");
  assert.equal(attempt.testVersion, "v2");
  for (const q of h.load("src/data/questionOrder.ts").orderedQuestions) {
    attempt = progress.selectAnswer(attempt, q.choices[0].id);
    attempt = progress.moveQuestion(attempt, 1);
  }
  const completed = progress.finishAttempt(attempt).progress;
  const current = snapshots.resolveResultSnapshot(JSON.stringify(completed));
  assert.equal(current.status, "ready");
  assert.equal(current.result.testVersion, "v2");
  for (const saved of [attempt, completed]) {
    const raw = JSON.stringify({ ...saved, testVersion: "v1" });
    assert.equal(progress.restoreAttempt(raw).kind, "version_mismatch");
    assert.equal(snapshots.resolveResultSnapshot(raw).status, "invalid");
  }
});

test("attempt, completion, retry and share events carry v2 through existing analytics paths", async () => {
  const h = createHarness();
  const progress = h.load("src/lib/testProgress.ts");
  const tracking = h.load("src/lib/testAnalytics.ts");
  const analytics = h.load("src/lib/analytics.ts");
  let attempt = progress.createAttempt("v2-events");
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  tracking.trackTestStart(attempt, false);
  tracking.trackQuestionView(attempt, 0);
  tracking.trackAnswer(attempt, questions[0].choices[0].id, true);
  attempt = progress.selectAnswer(attempt, questions[0].choices[0].id);
  tracking.trackAnswer(attempt, questions[0].choices[1].id, true);
  for (const q of questions) {
    attempt = progress.selectAnswer(attempt, q.choices[0].id);
    attempt = progress.moveQuestion(attempt, 1);
  }
  const done = progress.finishAttempt(attempt);
  tracking.trackTestComplete(done.progress, done.result);
  tracking.trackRetry(done.progress);
  const context = { attemptId: attempt.attemptId, testVersion: done.result.testVersion,
    mainType: done.result.mainResult.id, typeName: done.result.mainResult.name };
  const share = h.load("src/lib/shareResult.ts").shareResult;
  await share(context, { share: async () => {} }, "https://example.invalid/result");
  await share(context, { clipboard: { writeText: async () => {} } }, "https://example.invalid/result");
  await analytics.initializeAnalytics();
  for (const name of ["test_start", "question_view", "question_answer", "answer_change", "test_complete", "retry_click", "share_click", "share_success", "copy_link"]) {
    const events = h.events.filter(event => event.name === name);
    assert.ok(events.length > 0, name);
    for (const event of events) assert.equal(event.properties.test_version, "v2", name);
  }
});
