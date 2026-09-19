import { restoreAttempt, TEST_STORAGE_KEY } from "@/lib/testProgress";

const ARCHIVE_KEY = "pubg-playstyle-test:completed-results";
const HISTORY_KEY = "pubgResultKey";
type Entry = { key: string; raw: string };

function readEntries(): Entry[] {
  const value: unknown = JSON.parse(window.sessionStorage.getItem(ARCHIVE_KEY) ?? "[]");
  if (!Array.isArray(value) || value.some(entry => !entry ||
      typeof entry.key !== "string" || typeof entry.raw !== "string")) {
    throw new Error("RESULT_ARCHIVE_INVALID");
  }
  return value;
}

// Only this tab retains completed answers. Credentials are never archived.
// Failure must stop an explicit start before it replaces the completed attempt.
export function archiveCompletedResult(): string | null {
  const raw = window.localStorage.getItem(TEST_STORAGE_KEY);
  const restored = restoreAttempt(raw);
  if (restored.kind !== "completed" || raw === null) return null;
  const entries = readEntries();
  const existing = entries.find(entry => entry.raw === raw);
  if (existing) return existing.key;
  const key = crypto.randomUUID();
  window.sessionStorage.setItem(ARCHIVE_KEY, JSON.stringify([...entries, { key, raw }]));
  return key;
}

// Called on result subscription, never while rendering. Preserve Next's state.
export function bindResultHistory() {
  if (window.location.pathname !== "/result" || window.history.state?.[HISTORY_KEY]) return;
  try {
    const key = archiveCompletedResult();
    if (key) window.history.replaceState({ ...window.history.state, [HISTORY_KEY]: key }, "");
  } catch { /* The active local result remains readable if session storage is blocked. */ }
}

export function readResultHistory(): string | null {
  const key = window.location.pathname === "/result" ? window.history.state?.[HISTORY_KEY] : null;
  if (typeof key === "string") {
    // A missing bound result must not silently display a different attempt.
    return readEntries().find(entry => entry.key === key)?.raw ?? null;
  }
  return window.localStorage.getItem(TEST_STORAGE_KEY);
}
