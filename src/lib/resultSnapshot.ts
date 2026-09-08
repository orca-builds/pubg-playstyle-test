import { calculateScore } from "@/lib/scoring";
import type { ScoringResult } from "@/lib/scoring";
import { restoreAttempt, TEST_STORAGE_KEY } from "@/lib/testProgress";
import type { CompletedAttempt } from "@/types/testProgress";

export type ResultSnapshot =
  | { status: "initializing" }
  | { status: "ready"; attemptId: string; result: ScoringResult }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "error" };

const initializing: ResultSnapshot = { status: "initializing" };
const storageError: ResultSnapshot = { status: "error" };
let cachedRaw: string | null | undefined;
let cachedSnapshot: ResultSnapshot = initializing;
const listeners = new Set<() => void>();

// 서버에서는 브라우저 저장값을 읽을 수 없으므로 미확인과 결과 없음을 구분합니다.
export function getServerResultSnapshot(): ResultSnapshot {
  return initializing;
}

export function resolveResultSnapshot(raw: string | null): ResultSnapshot {
  try {
    const saved = restoreAttempt(raw);
    if (saved.kind === "completed") {
      return { status: "ready", attemptId: saved.progress.attemptId, result: calculateScore(saved.progress.answers) };
    }
    if (saved.kind === "empty" || saved.kind === "in_progress" || saved.kind === "expired") {
      return { status: "missing" };
    }
    return { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

// 같은 저장값에는 같은 객체를 반환해 불필요한 재렌더링과 재계산을 막습니다.
export function getResultSnapshot(): ResultSnapshot {
  try {
    const raw = window.localStorage.getItem(TEST_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedSnapshot = resolveResultSnapshot(raw);
      cachedRaw = raw;
    }
    return cachedSnapshot;
  } catch {
    return storageError;
  }
}

// 완료 상태 저장 성공 후 호출합니다. 결과는 이 저장값과 attempt에만 연결됩니다.
export function prepareResultSnapshot(progress: CompletedAttempt, result: ScoringResult) {
  cachedRaw = JSON.stringify(progress);
  cachedSnapshot = { status: "ready", attemptId: progress.attemptId, result };
  listeners.forEach((listener) => listener());
}

export function subscribeToResult(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === TEST_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", listener);
  };
}

export function retryResultSnapshot() {
  cachedRaw = undefined;
  listeners.forEach((listener) => listener());
}
