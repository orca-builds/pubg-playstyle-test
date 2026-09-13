import { isAttemptExpired } from "@/lib/testProgress";
import type { InProgressAttempt } from "@/types/testProgress";

export const CREDENTIAL_STORAGE_KEY = "pubg-playstyle-test:db-credential:v1";
export type AttemptCredential = { attemptId: string; writeToken: string; startedAt: string };

export function isStartResponse(value: unknown): value is { attempt_id: string; write_token: string } {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.attempt_id === "string" && response.attempt_id.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(response.attempt_id) &&
    typeof response.write_token === "string" && response.write_token.length === 43 &&
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(response.write_token);
}

// Separate from progress/result/analytics objects: never pass this object to UI or tracking.
export function readAttemptCredential(storage: Pick<Storage, "getItem">, progress: InProgressAttempt): AttemptCredential | null {
  try {
    const value = JSON.parse(storage.getItem(CREDENTIAL_STORAGE_KEY) ?? "null");
    if (!value || !isStartResponse({ attempt_id: value.attemptId, write_token: value.writeToken }) ||
        value.attemptId !== progress.attemptId || value.startedAt !== progress.startedAt ||
        isAttemptExpired(progress.startedAt)) return null;
    return { attemptId: value.attemptId, writeToken: value.writeToken, startedAt: value.startedAt };
  } catch { return null; }
}
