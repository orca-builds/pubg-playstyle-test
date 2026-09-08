import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const modules = new Map();
function loadSource(relativePath) {
  if (modules.has(relativePath)) return modules.get(relativePath);
  const source = readFileSync(path.join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, (id) => {
    if (!id.startsWith("@/")) return require(id);
    const file = `src/${id.slice(2)}`;
    return loadSource(existsSync(path.join(root, `${file}.ts`)) ? `${file}.ts` : `${file}.tsx`);
  });
  modules.set(relativePath, exports);
  return exports;
}

const {
  ATTEMPT_TTL_MS, TEST_STORAGE_KEY, createAttempt, restoreAttempt, isAttemptExpired,
  selectAnswer, moveQuestion, canGoNext, finishAttempt, saveAttempt,
} = loadSource("src/lib/testProgress.ts");
const { orderedQuestions, QUESTION_ORDER } = loadSource("src/data/questionOrder.ts");
const { questionSet } = loadSource("src/data/questions.ts");
const { calculateScore } = loadSource("src/lib/scoring.ts");
const QuestionCard = loadSource("src/components/QuestionCard.tsx").default;
const now = Date.parse("2026-09-08T10:00:00Z");
const start = () => createAttempt("attempt-original", now);
const restore = (progress, at = now) => restoreAttempt(JSON.stringify(progress), at);

function answerAll() {
  let progress = start();
  for (const question of orderedQuestions) {
    progress = selectAnswer(progress, question.choices[0].id);
    progress = moveQuestion(progress, 1);
  }
  return progress;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("고정 순서는 원본 24문항을 중복 없이 포함하고 원본 관리 순서는 보존", () => {
  assert.equal(QUESTION_ORDER.length, 24);
  assert.equal(new Set(QUESTION_ORDER).size, 24);
  assert.deepEqual([...QUESTION_ORDER].sort(), questionSet.questions.map(q => q.id).sort());
  assert.deepEqual(questionSet.questions.map(q => q.id), Array.from({ length: 24 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`));
  assert.deepEqual(["q21", "q22", "q23", "q24"].map(id => QUESTION_ORDER.indexOf(id)), [4, 9, 14, 19]);
});

test("선택 없이 다음 진행 불가, 선택만으로 자동 이동하지 않음", () => {
  const original = start();
  assert.equal(canGoNext(original), false);
  assert.deepEqual(moveQuestion(original, 1), original);
  const selected = selectAnswer(original, "q01-a");
  assert.equal(selected.currentQuestionIndex, 0);
  assert.equal(canGoNext(selected), true);
  assert.equal(moveQuestion(selected, 1).currentQuestionIndex, 1);
  assert.equal(moveQuestion(original, -1).currentQuestionIndex, 0);
});

test("이전 답변 유지 및 변경은 누적이 아닌 교체", () => {
  const original = selectAnswer(start(), "q01-a");
  const back = moveQuestion(moveQuestion(original, 1), -1);
  assert.deepEqual(back.answers, original.answers);
  const changed = selectAnswer(back, "q01-b");
  assert.deepEqual(changed.answers, [{ questionId: "q01", choiceId: "q01-b" }]);
  assert.equal(original.answers[0].choiceId, "q01-a");
  assert.equal(changed.attemptId, original.attemptId);
  assert.equal(changed.startedAt, original.startedAt);
});

test("localStorage 직렬화·재복원은 위치, 답변, 시작 시간, attemptId 보존", () => {
  const storage = memoryStorage();
  const progress = moveQuestion(selectAnswer(start(), "q01-b"), 1);
  saveAttempt(storage, progress);
  const reloaded = restoreAttempt(storage.getItem(TEST_STORAGE_KEY), now + 1000);
  assert.equal(reloaded.kind, "in_progress");
  assert.deepEqual(reloaded.progress, progress);
  assert.deepEqual(restore(reloaded.progress, now + 2000).progress, progress);
});

test("이전 문항을 보던 중 재접속해도 위치와 이후 답변 보존", () => {
  const progress = moveQuestion(answerAll(), -1);
  const restored = restore(progress);
  assert.equal(restored.kind, "in_progress");
  assert.equal(restored.progress.currentQuestionIndex, 22);
  assert.equal(restored.progress.answers.length, 24);
});

test("새 attempt는 답변과 위치 초기화, ID와 시작 시간을 새로 받음", () => {
  const old = answerAll();
  const fresh = createAttempt("attempt-new", now + 5000);
  const storage = memoryStorage();
  saveAttempt(storage, old);
  saveAttempt(storage, fresh);
  assert.deepEqual(fresh.answers, []);
  assert.equal(fresh.currentQuestionIndex, 0);
  assert.notEqual(fresh.attemptId, old.attemptId);
  assert.notEqual(fresh.startedAt, old.startedAt);
  assert.deepEqual(restoreAttempt(storage.getItem(TEST_STORAGE_KEY), now + 5000).progress, fresh);
});

test("24시간 미만은 유효, 정확히 24시간부터 만료, 시작 기준을 갱신하지 않음", () => {
  const progress = start();
  assert.equal(isAttemptExpired(progress.startedAt, now + ATTEMPT_TTL_MS - 1), false);
  assert.equal(restore(progress, now + ATTEMPT_TTL_MS - 1).kind, "in_progress");
  assert.equal(restore(progress, now + ATTEMPT_TTL_MS).kind, "expired");
  assert.equal(restore(progress, now + ATTEMPT_TTL_MS + 1).kind, "expired");
  assert.throws(() => finishAttempt(answerAll(), now + ATTEMPT_TTL_MS), /유효 기간/);
});

test("버전과 출제 순서 불일치는 과거 응답 복원 불가", () => {
  assert.equal(restore({ ...start(), testVersion: "v0" }).kind, "version_mismatch");
  assert.equal(restore({ ...start(), questionOrderKey: "old-order" }).kind, "order_mismatch");
});

test("손상 JSON, 잘못된 index·시간·질문·선택지·중복·빈 구간을 거부", () => {
  assert.equal(restoreAttempt(null, now).kind, "empty");
  assert.equal(restoreAttempt("{broken", now).kind, "invalid");
  for (const data of [
    { ...start(), currentQuestionIndex: -1 },
    { ...start(), currentQuestionIndex: 24 },
    { ...start(), currentQuestionIndex: 0.5 },
    { ...start(), startedAt: "invalid-date" },
    { ...start(), startedAt: new Date(now + 1).toISOString() },
    { ...start(), attemptId: "" },
    { ...start(), answers: [{ questionId: "q99", choiceId: "q99-a" }] },
    { ...start(), answers: [{ questionId: "q01", choiceId: "q16-a" }] },
    { ...start(), answers: [{ questionId: "q01", choiceId: "q01-a" }, { questionId: "q01", choiceId: "q01-b" }] },
    { ...start(), currentQuestionIndex: 1 },
    { ...start(), answers: [{ questionId: "q16", choiceId: "q16-a" }] },
  ]) assert.equal(restore(data).kind, "invalid");
});

test("마지막 미응답이면 완료 불가, 최종 답변 24개를 scoring에 전달", () => {
  let progress = answerAll();
  assert.equal(progress.currentQuestionIndex, 23);
  assert.equal(canGoNext({ ...progress, answers: progress.answers.slice(0, -1) }), false);
  assert.throws(() => finishAttempt({ ...progress, answers: progress.answers.slice(0, -1) }, now), /모든 질문/);
  for (let i = 0; i < 23; i++) progress = moveQuestion(progress, -1);
  progress = selectAnswer(progress, "q01-b");
  for (let i = 0; i < 23; i++) progress = moveQuestion(progress, 1);
  let received;
  const completed = finishAttempt(progress, now + 1000, (answers) => {
    received = answers;
    return calculateScore(answers);
  });
  assert.equal(received.length, 24);
  assert.equal(new Set(received.map(answer => answer.questionId)).size, 24);
  assert.deepEqual(received, progress.answers);
  assert.equal(completed.result.mainScores.combat, 4);
  assert.equal(completed.result.mainScores.position, 1);
});

test("완료 기록은 이어하기 대상이 아니며 저장된 답변으로 결과 재계산", () => {
  const { progress, result } = finishAttempt(answerAll(), now + 1000);
  const restored = restore(progress, now + 2000);
  assert.equal(restored.kind, "completed");
  assert.deepEqual(calculateScore(restored.progress.answers), result);
  assert.equal(restore(progress, now + ATTEMPT_TTL_MS + 1).kind, "completed");
  assert.equal(restore({ ...progress, answers: [] }, now + 2000).kind, "invalid");
});

test("scoring 실패 시 답변을 유지하고 완료 상태를 저장하지 않음", () => {
  const progress = answerAll();
  const before = JSON.stringify(progress);
  const storage = memoryStorage();
  saveAttempt(storage, progress);
  assert.throws(() => {
    const done = finishAttempt(progress, now, () => { throw new Error("scoring failure"); });
    saveAttempt(storage, done.progress);
  }, /scoring failure/);
  assert.equal(JSON.stringify(progress), before);
  assert.equal(restoreAttempt(storage.getItem(TEST_STORAGE_KEY), now).kind, "in_progress");
  assert.equal(finishAttempt(progress, now).progress.status, "completed");
});

test("저장 오류를 전달하고 성공한 것으로 처리하지 않음", () => {
  const storage = { setItem() { throw new Error("storage blocked"); } };
  assert.throws(() => saveAttempt(storage, start()), /storage blocked/);
});

test("선택지 원문, 버튼 전체의 선택 상태와 체크 표시", () => {
  const question = orderedQuestions[0];
  const html = renderToStaticMarkup(createElement(QuestionCard, {
    question, selectedChoiceId: question.choices[1].id, onSelect() {},
  }));
  assert.ok(html.includes(question.text));
  for (const choice of question.choices) assert.ok(html.includes(choice.text));
  assert.equal((html.match(/<button /g) ?? []).length, 2);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.ok(html.includes("✓ 선택됨"));
  assert.ok(html.includes('type="button"'));
});
