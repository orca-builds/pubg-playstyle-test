import { orderedQuestions } from "@/data/questionOrder";
import { readAttemptCredential } from "@/lib/attemptCredentials";
import type { InProgressAttempt } from "@/types/testProgress";

// Only acknowledged choices, never a token. Kept separate from Analytics and progress.
export const ANSWER_SYNC_KEY = "pubg-playstyle-test:answer-sync:v1";
type Acknowledged = { attemptId: string; answers: Record<string, string> };
type SaveQueue = {
  latest: InProgressAttempt;
  promise: Promise<void> | null;
  failed: boolean;
  stopped: boolean;
};
const queues = new Map<string, SaveQueue>();

// Called only after a new attempt has committed. An old response must not update
// the new attempt's acknowledgements or send its remaining queued answers.
export function retainAnswerQueue(attemptId: string): void {
  for (const [id, queue] of queues) {
    if (id === attemptId) continue;
    queue.stopped = true;
    queues.delete(id);
  }
}

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

export function syncDatabaseAnswers(progress: InProgressAttempt, retry = false): Promise<void> {
  let queue = queues.get(progress.attemptId);
  if (!queue) {
    queue = { latest: progress, promise: null, failed: false, stopped: false };
    queues.set(progress.attemptId, queue);
  }
  // The complete local snapshot is the pending queue. Unsent changes to the same
  // question coalesce; the active request always finishes before the next starts.
  queue.latest = progress;
  if (queue.promise) return queue.promise;
  if (queue.failed && !retry) return Promise.reject(new Error("ANSWER_SAVE_FAILED"));
  queue.failed = false;
  const active = queue;
  active.promise = sync(active).then(function settle(): void | Promise<void> {
    // Include selections enqueued between the worker returning and this microtask.
    if (active.stopped) throw new Error("ANSWER_SAVE_FAILED");
    if (hasUnsyncedAnswers(window.localStorage, active.latest)) return sync(active).then(settle);
    active.promise = null;
  }).catch(() => {
    active.failed = true;
    active.promise = null;
    throw new Error("ANSWER_SAVE_FAILED");
  });
  return active.promise;
}

async function sync(queue: SaveQueue): Promise<void> {
  try {
    const storage = window.localStorage;
    const progress = queue.latest;
    const credential = readAttemptCredential(storage, progress);
    if (!credential) throw new Error("ANSWER_SAVE_FAILED");
    while (true) {
      if (queue.stopped || !readAttemptCredential(storage, progress)) throw new Error("ANSWER_SAVE_FAILED");
      const acknowledged = readAcknowledged(storage, progress.attemptId);
      const answer = queue.latest.answers.find(item => acknowledged.answers[item.questionId] !== item.choiceId);
      if (!answer) return;
      const index = orderedQuestions.findIndex(question => question.id === answer.questionId);
      if (index < 0) throw new Error("ANSWER_SAVE_FAILED");
      const response = await fetch(`/api/attempts/${progress.attemptId}/answers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ write_token: credential.writeToken, question_id: answer.questionId,
          answer_id: answer.choiceId, question_index: index + 1 }),
      });
      if (response.status !== 200) throw new Error("ANSWER_SAVE_FAILED");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("saved" in result) || result.saved !== true ||
          !("last_question_index" in result) || typeof result.last_question_index !== "number" ||
          !Number.isInteger(result.last_question_index) || result.last_question_index < index + 1 ||
          result.last_question_index > orderedQuestions.length) throw new Error("ANSWER_SAVE_FAILED");
      if (queue.stopped || !readAttemptCredential(storage, progress)) throw new Error("ANSWER_SAVE_FAILED");
      // Read again: local selections may have invalidated other acknowledgements
      // while this request was pending. A stale copy would lose those changes.
      const current = readAcknowledged(storage, progress.attemptId);
      current.answers[answer.questionId] = answer.choiceId;
      storage.setItem(ANSWER_SYNC_KEY, JSON.stringify(current));
    }
  } catch {
    // No token, response body, credentials, or underlying network/storage error escapes.
    throw new Error("ANSWER_SAVE_FAILED");
  }
}
