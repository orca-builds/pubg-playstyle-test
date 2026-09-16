import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

function setup({ reduced = false, supported = true } = {}) {
  const h = createHarness();
  const observers = [];
  h.window.matchMedia = query => {
    assert.equal(query, "(prefers-reduced-motion: reduce)");
    return { matches: reduced };
  };
  if (supported) h.window.IntersectionObserver = class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.disconnections = 0;
      observers.push(this);
    }
    observe(target) { this.target = target; }
    disconnect() { this.disconnections++; }
    emit(ratio, isIntersecting = true, target = this.target) {
      this.callback([{ target, intersectionRatio: ratio, isIntersecting }]);
    }
  };
  let writes = 0;
  const button = { dataset: new Proxy({}, {
    set(target, key, value) { writes++; target[key] = value; return true; },
  }) };
  return { button, observers, get writes() { return writes; },
    attach: h.load("src/lib/observeShareAttention.ts").observeShareAttention };
}

test("waits for 70% actual visibility, then triggers once and disconnects", () => {
  const h = setup();
  const cleanup = h.attach(h.button);
  const observer = h.observers[0];
  assert.deepEqual(observer.options, { threshold: 0.7 });
  assert.equal(observer.target, h.button);
  for (const ratio of [0, 0.3, 0.69]) observer.emit(ratio);
  observer.emit(1, false);
  observer.emit(1, true, {});
  assert.equal(h.writes, 0);
  observer.emit(0.7);
  assert.equal(h.button.dataset.shareAttention, "started");
  assert.equal(observer.disconnections, 1);
  for (const ratio of [1, 0, 0.5, 0.8, 1]) observer.emit(ratio);
  assert.equal(h.writes, 1);
  cleanup();
  assert.equal(observer.disconnections, 2);
});

test("unmount disconnects and ignores callbacks already queued before cleanup", () => {
  const h = setup();
  const cleanup = h.attach(h.button);
  cleanup();
  assert.equal(h.observers[0].disconnections, 1);
  h.observers[0].emit(1);
  assert.equal(h.writes, 0);
});

test("Strict Mode reconnects before visibility but never replays after starting", () => {
  const h = setup();
  h.attach(h.button)();
  const cleanup = h.attach(h.button);
  assert.equal(h.observers.length, 2);
  h.observers[1].emit(0.8);
  cleanup();
  assert.equal(h.attach(h.button), undefined);
  assert.equal(h.observers.length, 2);
  assert.equal(h.writes, 1);
});

test("reduced motion, unsupported browsers and null refs leave the CTA static", () => {
  for (const options of [{ reduced: true }, { supported: false }]) {
    const h = setup(options);
    assert.equal(h.attach(null), undefined);
    assert.equal(h.attach(h.button), undefined);
    assert.equal(h.observers.length, 0);
    assert.equal(h.writes, 0);
  }
});
