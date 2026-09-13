import { readAttemptCredential } from "@/lib/attemptCredentials";
import { matchesResult, toResultColumns } from "@/lib/completionResult";
import { getAttemptMetrics } from "@/lib/testAnalytics";
import type { InProgressAttempt } from "@/types/testProgress";
import type { ScoringResult } from "@/lib/scoring";

export const COMPLETION_PENDING_KEY = "pubg-playstyle-test:completion-pending:v1";
export type CompletionMetrics = { duration_seconds: number; answer_change_count: number; back_count: number };
const inFlight = new Map<string, Promise<CompletionMetrics>>();

export function hasPendingCompletion(progress: InProgressAttempt): boolean {
  return window.localStorage.getItem(COMPLETION_PENDING_KEY) === progress.attemptId;
}

export function clearPendingCompletion(attemptId: string): void {
  if (window.localStorage.getItem(COMPLETION_PENDING_KEY) === attemptId) {
    window.localStorage.removeItem(COMPLETION_PENDING_KEY);
  }
}

export function completeDatabaseAttempt(progress: InProgressAttempt, result: ScoringResult): Promise<CompletionMetrics> {
  const active = inFlight.get(progress.attemptId);
  if (active) return active;
  const promise = complete(progress, result).finally(() => { inFlight.delete(progress.attemptId); });
  inFlight.set(progress.attemptId, promise);
  return promise;
}

async function complete(progress: InProgressAttempt, result: ScoringResult): Promise<CompletionMetrics> {
  try {
    const credential = readAttemptCredential(window.localStorage, progress);
    if (!credential) throw new Error("COMPLETE_FAILED");
    // A lost response may still mean DB completion. Freeze edits across reload until resolved.
    window.localStorage.setItem(COMPLETION_PENDING_KEY, progress.attemptId);
    const metrics = getAttemptMetrics(progress.attemptId);
    const response = await fetch(`/api/attempts/${progress.attemptId}/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ write_token: credential.writeToken,
        duration_seconds: Math.max(0, (Date.now() - Date.parse(progress.startedAt)) / 1000),
        ...toResultColumns(result), answer_change_count: metrics.answer_change_count, back_count: metrics.back_count }),
    });
    if (response.status !== 200) throw new Error("COMPLETE_FAILED");
    const body = await response.json();
    if (!body || body.completed !== true || typeof body.already_completed !== "boolean" ||
        !body.result || !matchesResult(body.result, result) ||
        typeof body.duration_seconds !== "number" || !Number.isFinite(body.duration_seconds) ||
        body.duration_seconds < 0 || body.duration_seconds > 86_400 ||
        !Number.isInteger(body.answer_change_count) || body.answer_change_count < 0 || body.answer_change_count > 2_147_483_647 ||
        !Number.isInteger(body.back_count) || body.back_count < 0 || body.back_count > 2_147_483_647) throw new Error("COMPLETE_FAILED");
    return { duration_seconds: body.duration_seconds, answer_change_count: body.answer_change_count, back_count: body.back_count };
  } catch { throw new Error("COMPLETE_FAILED"); }
}
