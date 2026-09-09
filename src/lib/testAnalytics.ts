import { orderedQuestions } from "@/data/questionOrder";
import { trackEvent } from "@/lib/analytics";
import { readBrowserValue, writeBrowserValue } from "@/lib/browserStorage";
import type { ScoringResult } from "@/lib/scoring";
import type { CompletedAttempt, InProgressAttempt } from "@/types/testProgress";

type AttemptContext = { attemptId: string; testVersion: string };
type Metrics = { answer_change_count: number; back_count: number; is_retry: boolean };
const metricsKey = (id: string) => `pubg-playstyle-test:analytics:attempt:${id}`;
const retryKey = "pubg-playstyle-test:analytics:retry-request";
const props = (attempt: AttemptContext) => ({ attempt_id: attempt.attemptId, test_version: attempt.testVersion });

export function getAttemptMetrics(attemptId: string): Metrics {
  try {
    const value = JSON.parse(readBrowserValue("localStorage", metricsKey(attemptId)) ?? "null");
    if (value && Number.isSafeInteger(value.answer_change_count) && value.answer_change_count >= 0 &&
        Number.isSafeInteger(value.back_count) && value.back_count >= 0 && typeof value.is_retry === "boolean") {
      return { answer_change_count: value.answer_change_count, back_count: value.back_count, is_retry: value.is_retry };
    }
  } catch { /* Older attempts have no analytics sidecar. */ }
  return { answer_change_count: 0, back_count: 0, is_retry: false };
}

function saveMetrics(id: string, value: Metrics) {
  writeBrowserValue("localStorage", metricsKey(id), JSON.stringify(value));
}

export function hasRetryRequest(): boolean {
  return readBrowserValue("sessionStorage", retryKey) === "1";
}
export function clearRetryRequest(): void {
  writeBrowserValue("sessionStorage", retryKey, "0");
}
export function trackRetry(attempt: AttemptContext, navigateToTest = false): void {
  trackEvent("retry_click", props(attempt));
  if (navigateToTest) writeBrowserValue("sessionStorage", retryKey, "1");
}

export function trackTestStart(attempt: InProgressAttempt, isRetry: boolean): void {
  const metrics = getAttemptMetrics(attempt.attemptId);
  saveMetrics(attempt.attemptId, { ...metrics, is_retry: metrics.is_retry || isRetry });
  trackEvent("test_start", { ...props(attempt), is_retry: isRetry }, {
    scope: "localStorage", key: `start:${attempt.attemptId}`,
  });
}

export function trackQuestionView(attempt: AttemptContext, index: number): void {
  const question = orderedQuestions[index];
  if (!question) return;
  trackEvent("question_view", {
    ...props(attempt), question_id: question.id, question_index: index + 1,
    total_questions: orderedQuestions.length,
  });
}

export function trackAnswer(attempt: InProgressAttempt, answerId: string, saved: boolean): void {
  const question = orderedQuestions[attempt.currentQuestionIndex];
  const position = question.choices.findIndex((choice) => choice.id === answerId) + 1;
  if (!position) return;
  const common = { ...props(attempt), question_id: question.id, question_index: attempt.currentQuestionIndex + 1 };
  trackEvent("question_answer", {
    ...common, answer_id: answerId, display_position: position,
    display_label: String.fromCharCode(64 + position), answer_saved: saved,
  });
  const previous = attempt.answers.find((answer) => answer.questionId === question.id)?.choiceId;
  if (saved && previous && previous !== answerId) {
    const metrics = getAttemptMetrics(attempt.attemptId);
    saveMetrics(attempt.attemptId, { ...metrics, answer_change_count: metrics.answer_change_count + 1 });
    trackEvent("answer_change", { ...common, previous_answer_id: previous, new_answer_id: answerId });
  }
}

export function trackBack(attempt: InProgressAttempt, nextIndex: number): void {
  if (nextIndex === attempt.currentQuestionIndex) return;
  const metrics = getAttemptMetrics(attempt.attemptId);
  saveMetrics(attempt.attemptId, { ...metrics, back_count: metrics.back_count + 1 });
  trackEvent("question_back", {
    ...props(attempt), from_question_index: attempt.currentQuestionIndex + 1, to_question_index: nextIndex + 1,
  });
}

export function trackTestComplete(attempt: CompletedAttempt, result: ScoringResult): void {
  trackEvent("test_complete", {
    ...props(attempt), ...getAttemptMetrics(attempt.attemptId),
    duration_seconds: Math.max(0, (Date.parse(attempt.completedAt) - Date.parse(attempt.startedAt)) / 1000),
    main_type: result.mainResult.id,
    main_scores: { ...result.mainScores },
    top_sub_tag_1: result.displaySubTags[0] ?? null,
    top_sub_tag_2: result.displaySubTags[1] ?? null,
  }, { scope: "localStorage", key: `complete:${attempt.attemptId}` });
}
