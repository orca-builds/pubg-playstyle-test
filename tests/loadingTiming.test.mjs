import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";
import { setup, saved } from "./helpers/answerQueueHarness.mjs";

const message = { title: "테스트 준비 중", description: "문항을 준비하고 있어요." };
const flush = () => new Promise(resolve => queueMicrotask(resolve));
function setupClock(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const h = createHarness();
  const lib = h.load("src/lib/loadingTiming.ts");
  const timing = lib.createLoadingTiming();
  t.after(() => timing.dispose());
  return { timing, id: Symbol(), tick: ms => t.mock.timers.tick(ms) };
}

test("180ms work never shows the overlay, even when the original show deadline passes", async t => {
  const { timing, id, tick } = setupClock(t);
  const visible = [];
  timing.subscribe(() => visible.push(timing.getSnapshot()));
  timing.begin(id, message);
  tick(180); timing.end(id); await flush(); tick(2000);
  assert.ok(visible.every(value => value === null));
});

test("600ms work shows at 300ms and hides at 1000ms: exactly 700ms visible", async t => {
  const { timing, id, tick } = setupClock(t);
  timing.begin(id, message);
  tick(299); assert.equal(timing.getSnapshot(), null);
  tick(1); assert.deepEqual(timing.getSnapshot(), message);
  tick(300); timing.end(id); await flush();
  tick(399); assert.deepEqual(timing.getSnapshot(), message);
  tick(1); assert.equal(timing.getSnapshot(), null);
});

test("2-second work has no extra minimum-duration wait", async t => {
  const { timing, id, tick } = setupClock(t);
  timing.begin(id, message); tick(300); tick(1700);
  assert.equal(await timing.waitForMinimum(), true);
  timing.end(id); await flush();
  assert.equal(timing.getSnapshot(), null);
});

for (const phase of ["start", "complete"]) {
  test(`${phase} failure hides immediately and old timers cannot reopen on retry`, async t => {
    const { timing, id, tick } = setupClock(t);
    timing.begin(id, message); tick(300); tick(100);
    timing.end(id, true);
    assert.equal(timing.getSnapshot(), null);
    const next = Symbol(); timing.begin(next, message);
    tick(299); assert.equal(timing.getSnapshot(), null);
    tick(1); assert.deepEqual(timing.getSnapshot(), message);
    timing.end(next, true); tick(3000);
    assert.equal(timing.getSnapshot(), null);
  });
}

test("landing/test handoff preserves show delay and visible duration across source unmount", async t => {
  const { timing, id, tick } = setupClock(t);
  timing.begin(id, message); tick(180);
  timing.end(id); const testPage = Symbol(); timing.begin(testPage, message); await flush();
  tick(120); assert.deepEqual(timing.getSnapshot(), message);
  tick(300); timing.end(testPage); await flush();
  tick(399); assert.deepEqual(timing.getSnapshot(), message);
  tick(1); assert.equal(timing.getSnapshot(), null);
});

test("dispose cancels all timers and navigation waiters without later notifications", async t => {
  const { timing, id, tick } = setupClock(t);
  let updates = 0; timing.subscribe(() => updates++);
  timing.begin(id, message); tick(300);
  const waiting = timing.waitForMinimum();
  timing.dispose(); const count = updates;
  assert.equal(await waiting, false);
  tick(3000); assert.equal(updates, count);
  timing.begin(Symbol(), message); timing.dispose(); tick(3000);
  assert.equal(timing.getSnapshot(), null);
});

test("completion succeeds before the show callback: no late flash", async t => {
  const { timing, id, tick } = setupClock(t);
  timing.begin(id, message); tick(180);
  assert.equal(await timing.waitForMinimum(), true);
  tick(1000); assert.equal(timing.getSnapshot(), null);
});

test("actual complete handler calls API immediately, waits only before route, and keeps duplicate lock", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  let resolveComplete;
  const h = setup({ fetch: async (url, init) => saved(init), complete: () => new Promise(resolve => { resolveComplete = resolve; }) });
  for (const [i, question] of h.questions.entries()) {
    h.render().handleSelect(question.choices[0].id);
    if (i < 23) await h.render().handleNext();
  }
  await h.sync.syncDatabaseAnswers(h.state.progress);
  const timing = h.load("src/lib/loadingTiming.ts").loadingTiming;
  t.after(() => timing.dispose());
  timing.begin(Symbol(), message);
  const finishing = h.render().handleNext();
  // Flush the answer acknowledgement/complete Promise chain without real time.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.calls.filter(value => value === "complete").length, 1);
  t.mock.timers.tick(300); t.mock.timers.tick(300);
  resolveComplete();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.state.route, "");
  await h.render().handleNext();
  assert.equal(h.calls.filter(value => value === "complete").length, 1);
  t.mock.timers.tick(399); assert.equal(h.state.route, "");
  t.mock.timers.tick(1); await finishing;
  assert.equal(h.state.route, "/result");
});

test("duplicate cleanup cannot leave an old hide timer that interrupts a new operation", async t => {
  const { timing, id, tick } = setupClock(t);
  timing.begin(id, message); tick(300); tick(100);
  timing.end(id); timing.end(id); await flush();
  tick(100); const next = Symbol(); timing.begin(next, message);
  tick(500); assert.deepEqual(timing.getSnapshot(), message);
  timing.end(next); await flush(); assert.equal(timing.getSnapshot(), null);
});

test("unmount while final navigation waits cannot push a result route", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const h = setup();
  for (const [i, question] of h.questions.entries()) {
    h.render().handleSelect(question.choices[0].id);
    if (i < 23) await h.render().handleNext();
  }
  await h.sync.syncDatabaseAnswers(h.state.progress);
  const timing = h.load("src/lib/loadingTiming.ts").loadingTiming;
  t.after(() => timing.dispose());
  timing.begin(Symbol(), message); t.mock.timers.tick(300);
  const finishing = h.render().handleNext();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  h.mounted.current = false;
  timing.dispose(); await finishing;
  t.mock.timers.tick(3000);
  assert.equal(h.state.route, "");
});
