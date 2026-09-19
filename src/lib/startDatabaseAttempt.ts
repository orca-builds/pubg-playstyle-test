import { questionSet } from "@/data/questions";
import { QUESTION_ORDER_KEY } from "@/data/questionOrder";
import { getVisitorContext } from "@/lib/visitorContext";
import { createAttempt, saveAttempt } from "@/lib/testProgress";
import { CREDENTIAL_STORAGE_KEY, isStartResponse } from "@/lib/attemptCredentials";
import { clearRetryRequest, trackTestStart } from "@/lib/testAnalytics";
import type { InProgressAttempt } from "@/types/testProgress";
import { ANSWER_SYNC_KEY, retainAnswerQueue } from "@/lib/syncDatabaseAnswers";
import { COMPLETION_PENDING_KEY } from "@/lib/completeDatabaseAttempt";
import { archiveCompletedResult } from "@/lib/resultHistory";

let inFlight: Promise<InProgressAttempt> | null = null;
// If persistence fails after issuance, a manual retry reuses the issued credential.
// Kept private: never returned to React or Analytics.
let issued: { progress: InProgressAttempt; writeToken: string; isRetry: boolean } | null = null;

export function hasPendingDatabaseStart(): boolean {
  return inFlight !== null || issued !== null;
}

export function startDatabaseAttempt(isRetry = false): Promise<InProgressAttempt> {
  if (inFlight) return inFlight;
  inFlight = start(isRetry).finally(() => { inFlight = null; });
  return inFlight;
}

async function start(isRetry: boolean): Promise<InProgressAttempt> {
  try {
    const storage = window.localStorage;
    archiveCompletedResult();
    // Check write access before creating a DB row. Do not use best-effort analytics storage.
    const previous = storage.getItem(CREDENTIAL_STORAGE_KEY);
    if (previous === null) {
      storage.setItem(CREDENTIAL_STORAGE_KEY, "null");
      storage.removeItem(CREDENTIAL_STORAGE_KEY);
    } else storage.setItem(CREDENTIAL_STORAGE_KEY, previous);

    if (!issued) {
      const context = getVisitorContext();
      if (!context) throw new Error("START_FAILED");
      const response = await fetch("/api/attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          anonymous_id: context.anonymous_id,
          session_id: context.session_id,
          test_version: questionSet.version,
          initial_source: context.initial_source,
          initial_medium: context.initial_medium,
          initial_campaign: context.initial_campaign,
          initial_referrer: context.initial_referrer,
          landing_page: context.landing_page,
          is_retry: isRetry,
          question_order_key: QUESTION_ORDER_KEY,
        }),
      });
      if (response.status !== 201) throw new Error("START_FAILED");
      const result: unknown = await response.json();
      if (!isStartResponse(result)) throw new Error("START_FAILED");
      issued = { progress: createAttempt(result.attempt_id), writeToken: result.write_token, isRetry };
    }

    const { progress, writeToken, isRetry: retry } = issued;
    // Progress is committed last, so there is never new progress without a credential.
    try {
      storage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify({
        attemptId: progress.attemptId, writeToken, startedAt: progress.startedAt,
      }));
      saveAttempt(storage, progress);
    } catch {
      // Preserve the old attempt/credential pair when replacing progress fails.
      if (previous === null) storage.removeItem(CREDENTIAL_STORAGE_KEY);
      else storage.setItem(CREDENTIAL_STORAGE_KEY, previous);
      throw new Error("START_FAILED");
    }
    issued = null;
    retainAnswerQueue(progress.attemptId);
    // These sidecars are attempt-scoped; even if cleanup fails, old values cannot
    // apply to the new ID. Never remove them before the new progress commits.
    for (const key of [ANSWER_SYNC_KEY, COMPLETION_PENDING_KEY]) {
      try { storage.removeItem(key); } catch { /* The new attempt is already committed. */ }
    }
    clearRetryRequest();
    trackTestStart(progress, retry);
    return progress;
  } catch {
    // Do not propagate response bodies, storage values, or network errors to the UI.
    throw new Error("START_FAILED");
  }
}
