import { questionSet } from "@/data/questions";
import { orderedQuestions, QUESTION_ORDER_KEY } from "@/data/questionOrder";
import { calculateScore } from "@/lib/scoring";
import type { TestAnswer } from "@/lib/scoring";
import type { CompletedAttempt, InProgressAttempt, TestProgress } from "@/types/testProgress";

export const TEST_STORAGE_KEY = "pubg-playstyle-test:attempt";
export const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

export function isAttemptExpired(startedAt: string, now = Date.now()): boolean {
  return now - Date.parse(startedAt) >= ATTEMPT_TTL_MS;
}

export function createAttempt(attemptId: string, now = Date.now()): InProgressAttempt {
  return {
    testVersion: questionSet.version,
    questionOrderKey: QUESTION_ORDER_KEY,
    currentQuestionIndex: 0,
    answers: [],
    startedAt: new Date(now).toISOString(),
    attemptId,
    status: "in_progress",
  };
}

type RestoreResult =
  | { kind: "empty" | "invalid" | "expired" | "version_mismatch" | "order_mismatch" }
  | { kind: "in_progress"; progress: InProgressAttempt }
  | { kind: "completed"; progress: CompletedAttempt };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 브라우저 저장값은 현재 질문과 대조해 검증한 뒤 복원합니다. */
export function restoreAttempt(raw: string | null, now = Date.now()): RestoreResult {
  if (raw === null) return { kind: "empty" };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { kind: "invalid" }; }
  if (!isObject(value)) return { kind: "invalid" };
  if (value.testVersion !== questionSet.version) return { kind: "version_mismatch" };
  if (value.questionOrderKey !== QUESTION_ORDER_KEY) return { kind: "order_mismatch" };
  if ((value.status !== "in_progress" && value.status !== "completed") ||
      typeof value.attemptId !== "string" || !value.attemptId.trim() || value.attemptId.length > 100 ||
      typeof value.startedAt !== "string" || !Number.isFinite(Date.parse(value.startedAt)) ||
      Date.parse(value.startedAt) > now ||
      typeof value.currentQuestionIndex !== "number" || !Number.isInteger(value.currentQuestionIndex) ||
      value.currentQuestionIndex < 0 || value.currentQuestionIndex >= orderedQuestions.length ||
      !Array.isArray(value.answers) || value.answers.length > orderedQuestions.length) {
    return { kind: "invalid" };
  }

  const answers: TestAnswer[] = [];
  const seen = new Set<string>();
  for (const answer of value.answers) {
    if (!isObject(answer) || typeof answer.questionId !== "string" || typeof answer.choiceId !== "string") {
      return { kind: "invalid" };
    }
    const question = orderedQuestions.find((item) => item.id === answer.questionId);
    if (!question || seen.has(question.id) || !question.choices.some((choice) => choice.id === answer.choiceId)) {
      return { kind: "invalid" };
    }
    seen.add(question.id);
    answers.push({ questionId: question.id, choiceId: answer.choiceId });
  }
  // 지나온 질문이 미응답이거나 답변 중간에 빈 문항이 있으면 복원하지 않습니다.
  const firstUnanswered = orderedQuestions.findIndex((question) => !seen.has(question.id));
  if (firstUnanswered !== -1 && (value.currentQuestionIndex > firstUnanswered ||
      orderedQuestions.slice(firstUnanswered).some((question) => seen.has(question.id)))) {
    return { kind: "invalid" };
  }
  const base = {
    testVersion: questionSet.version, questionOrderKey: QUESTION_ORDER_KEY,
    currentQuestionIndex: value.currentQuestionIndex, answers,
    attemptId: value.attemptId, startedAt: value.startedAt,
  };
  if (value.status === "completed") {
    if (answers.length !== orderedQuestions.length || value.currentQuestionIndex !== orderedQuestions.length - 1 ||
        typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)) ||
        Date.parse(value.completedAt) < Date.parse(value.startedAt) || Date.parse(value.completedAt) > now) {
      return { kind: "invalid" };
    }
    return { kind: "completed", progress: { ...base, status: "completed", completedAt: value.completedAt } };
  }
  if (isAttemptExpired(value.startedAt, now)) return { kind: "expired" };
  return { kind: "in_progress", progress: { ...base, status: "in_progress" } };
}

export function selectAnswer(progress: InProgressAttempt, choiceId: string): InProgressAttempt {
  const question = orderedQuestions[progress.currentQuestionIndex];
  if (!question.choices.some((choice) => choice.id === choiceId)) throw new Error("유효하지 않은 선택지입니다.");
  const answer = { questionId: question.id, choiceId };
  const exists = progress.answers.some((item) => item.questionId === question.id);
  return {
    ...progress,
    answers: exists
      ? progress.answers.map((item) => item.questionId === question.id ? answer : item)
      : [...progress.answers, answer],
  };
}

export function canGoNext(progress: InProgressAttempt): boolean {
  const current = orderedQuestions[progress.currentQuestionIndex];
  const selected = progress.answers.some((answer) => answer.questionId === current.id);
  return selected && (progress.currentQuestionIndex < orderedQuestions.length - 1 ||
    progress.answers.length === orderedQuestions.length);
}

export function moveQuestion(progress: InProgressAttempt, direction: -1 | 1): InProgressAttempt {
  if (direction === 1 && !canGoNext(progress)) return progress;
  return {
    ...progress,
    currentQuestionIndex: Math.max(0, Math.min(orderedQuestions.length - 1, progress.currentQuestionIndex + direction)),
  };
}

// 최종 답변을 기존 계산 함수에 전달합니다. 실패하면 완료 상태를 만들지 않습니다.
export function finishAttempt(
  progress: InProgressAttempt,
  now = Date.now(),
  score: typeof calculateScore = calculateScore,
) {
  if (isAttemptExpired(progress.startedAt, now)) throw new Error("테스트 유효 기간이 지났습니다.");
  if (progress.currentQuestionIndex !== orderedQuestions.length - 1 || !canGoNext(progress)) {
    throw new Error("모든 질문에 답변해주세요.");
  }
  const result = score(progress.answers);
  const completed: CompletedAttempt = { ...progress, status: "completed", completedAt: new Date(now).toISOString() };
  return { progress: completed, result };
}

// 저장 성공을 확인한 뒤 화면을 이동합니다. 오류는 호출하는 화면에서 표시합니다.
export function saveAttempt(storage: Pick<Storage, "setItem">, progress: TestProgress) {
  storage.setItem(TEST_STORAGE_KEY, JSON.stringify(progress));
}
