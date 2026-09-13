export const LOADING_SHOW_DELAY_MS = 300;
export const LOADING_MIN_VISIBLE_MS = 700;
type Message = { title: string; description: string };

// Spans route handoffs and schedules presentation only, never API work.
export function createLoadingTiming() {
  const sources = new Map<symbol, Message>();
  const listeners = new Set<() => void>();
  let snapshot: Message | null = null;
  let shownAt: number | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const waits = new Map<ReturnType<typeof setTimeout>, (valid: boolean) => void>();
  function publish(value: Message | null) {
    snapshot = value;
    listeners.forEach(listener => listener());
  }
  function reset() {
    generation++;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    showTimer = hideTimer = undefined;
    shownAt = null;
    for (const [timer, resolve] of waits) { clearTimeout(timer); resolve(false); }
    waits.clear();
    publish(null);
  }
  function begin(id: symbol, message: Message) {
    sources.set(id, message);
    clearTimeout(hideTimer);
    hideTimer = undefined;
    if (shownAt !== null) { publish(message); return; }
    if (showTimer !== undefined) return;
    const current = generation;
    showTimer = setTimeout(() => {
      showTimer = undefined;
      if (current !== generation || sources.size === 0) return;
      shownAt = Date.now();
      publish([...sources.values()].at(-1)!);
    }, LOADING_SHOW_DELAY_MS);
  }
  function end(id: symbol, failed = false) {
    sources.delete(id);
    if (sources.size) return;
    if (failed) { reset(); return; }
    // Old-page cleanup and new-page setup share this clock in the same commit.
    const current = generation;
    queueMicrotask(() => {
      if (current !== generation || sources.size) return;
      clearTimeout(showTimer);
      showTimer = undefined;
      const remaining = shownAt === null ? 0 : Math.max(0, LOADING_MIN_VISIBLE_MS - (Date.now() - shownAt));
      clearTimeout(hideTimer);
      if (!remaining) reset();
      else hideTimer = setTimeout(() => {
        if (current === generation && sources.size === 0) reset();
      }, remaining);
    });
  }
  function waitForMinimum(): Promise<boolean> {
    // Work succeeded: a queued show callback must not open the overlay late.
    clearTimeout(showTimer);
    showTimer = undefined;
    const remaining = shownAt === null ? 0 : Math.max(0, LOADING_MIN_VISIBLE_MS - (Date.now() - shownAt));
    if (!remaining) return Promise.resolve(true);
    return new Promise(resolve => {
      const timer = setTimeout(() => { waits.delete(timer); resolve(true); }, remaining);
      waits.set(timer, resolve);
    });
  }
  return {
    begin, end, waitForMinimum,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { sources.clear(); reset(); },
  };
}
export const loadingTiming = createLoadingTiming();
