import { orderedQuestions } from "@/data/questionOrder";
import { readAttemptCredential } from "@/lib/attemptCredentials";
import type { InProgressAttempt } from "@/types/testProgress";

// Only acknowledged choices, never a token. Kept separate from Analytics and progress.
export const ANSWER_SYNC_KEY = "pubg-playstyle-test:answer-sync:v1";
type Acknowledged = { attemptId: string; answers: Record<string, string> };
const inFlight = new Map<string, { signature: string; promise: Promise<void> }>();

function readAcknowledged(storage: Pick<Storage, "getItem">, attemptId: string): Acknowledged {
  const raw = storage.getItem(ANSWER_SYNC_KEY);
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.attemptId === attemptId && value.answers && typeof value.answers === "object" &&
        !Array.isArray(value.answers) && Object.values(value.answers).every(answer => typeof answer === "string")) {
      return { attemptId, answers: value.answers };
    }
  } catch { /* Missing/corrupt acknowledgements require re-saving the local answers. */ }
  return { attemptId, answers: {} };
}

export function hasUnsyncedAnswers(storage: Pick<Storage, "getItem">, progress: InProgressAttempt): boolean {
  const acknowledged = readAcknowledged(storage, progress.attemptId);
  return progress.answers.some(answer => acknowledged.answers[answer.questionId] !== answer.choiceId);
}

export function invalidateAnswerAcknowledgement(storage: Pick<Storage, "getItem" | "setItem">,
  progress: InProgressAttempt, questionId: string): void {
  const acknowledged = readAcknowledged(storage, progress.attemptId);
  delete acknowledged.answers[questionId];
  storage.setItem(ANSWER_SYNC_KEY, JSON.stringify(acknowledged));
}

export function syncDatabaseAnswers(progress: InProgressAttempt): Promise<void> {
  const signature = JSON.stringify(progress.answers);
  const active = inFlight.get(progress.attemptId);
  if (active) {
    // Remounts share an identical save; never race a different set of choices.
    return active.signature === signature ? active.promise : Promise.reject(new Error("ANSWER_SAVE_FAILED"));
  }
  const promise = sync(progress).finally(() => { inFlight.delete(progress.attemptId); });
  inFlight.set(progress.attemptId, { signature, promise });
  return promise;
}

async function sync(progress: InProgressAttempt): Promise<void> {
  try {
    const storage = window.localStorage;
    const credential = readAttemptCredential(storage, progress);
    if (!credential) throw new Error("ANSWER_SAVE_FAILED");
    const acknowledged = readAcknowledged(storage, progress.attemptId);
    // Old local-only answers and interrupted saves are reconciled before moving on.
    for (const [index, question] of orderedQuestions.entries()) {
      const answer = progress.answers.find(item => item.questionId === question.id);
      if (!answer || acknowledged.answers[question.id] === answer.choiceId) continue;
      const response = await fetch(`/api/attempts/${progress.attemptId}/answers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ write_token: credential.writeToken, question_id: question.id,
          answer_id: answer.choiceId, question_index: index + 1 }),
      });
      if (response.status !== 200) throw new Error("ANSWER_SAVE_FAILED");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("saved" in result) || result.saved !== true ||
          !("last_question_index" in result) || typeof result.last_question_index !== "number" ||
          !Number.isInteger(result.last_question_index) || result.last_question_index < index + 1 ||
          result.last_question_index > orderedQuestions.length) throw new Error("ANSWER_SAVE_FAILED");
      acknowledged.answers[question.id] = answer.choiceId;
      storage.setItem(ANSWER_SYNC_KEY, JSON.stringify(acknowledged));
    }
  } catch {
    // No token, response body, credentials, or underlying network/storage error escapes.
    throw new Error("ANSWER_SAVE_FAILED");
  }
}
