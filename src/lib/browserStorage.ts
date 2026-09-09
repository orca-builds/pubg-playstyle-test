// Analytics/context storage is separate from the authoritative test progress.
// Storage denial falls back to this document's memory without blocking the UI.
type StorageScope = "localStorage" | "sessionStorage";
const memory = new Map<string, string>();

export function readBrowserValue(scope: StorageScope, key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window[scope].getItem(key);
    if (value !== null) return value;
  } catch { /* Storage can be denied by browser settings. */ }
  return memory.get(`${scope}:${key}`) ?? null;
}

export function writeBrowserValue(scope: StorageScope, key: string, value: string): void {
  if (typeof window === "undefined") return;
  memory.set(`${scope}:${key}`, value);
  try { window[scope].setItem(key, value); } catch { /* Best effort. */ }
}
