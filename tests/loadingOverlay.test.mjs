import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";
import { setup, saved, tick } from "./helpers/answerQueueHarness.mjs";

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}

function runner(h, overrides = {}) {
  const state = [h.state.progress, "questions", false, false, "", "", false, false, "ready", false, false];
  for (const [key, value] of Object.entries(overrides)) state[Number(key)] = value;
  let index = 0, refIndex = 0;
  const refs = [], callbacks = [];
  const ui = createHarness({ localStorage: h.window.localStorage, mocks: {
    react: {
      useState: () => { const i = index++; return [state[i], value => { state[i] = value; }]; },
      useRef: initial => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
      useEffect() {}, useCallback: callback => { callbacks.push(callback); return callback; },
    },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/syncDatabaseAnswers": h.sync,
    "@/lib/startDatabaseAttempt": h.load("src/lib/startDatabaseAttempt.ts"),
  } });
  const Component = ui.load("src/components/TestRunner.tsx").default;
  function render() {
    index = 0; refIndex = 0; callbacks.length = 0;
    return nodes(Component());
  }
  function overlay() { return render().find(node => node.props?.title === "테스트 준비 중" || node.props?.title === "결과 생성 중").props; }
  render();
  return { state, render, overlay, start: (...args) => callbacks[0](...args) };
}

test("overlay renders transparent image at intrinsic ratio, accessible text, and indeterminate bar only when open", () => {
  const h = createHarness();
  const Overlay = h.load("src/components/LoadingOverlayVisual.tsx").default;
  const props = { title: "결과 생성 중", description: "플레이스타일을 정리하고 있어요." };
  assert.equal(renderToStaticMarkup(createElement(Overlay, { ...props, open: false })), "");
  const html = renderToStaticMarkup(createElement(Overlay, { ...props, open: true }));
  for (const value of ['role="status"', 'aria-live="polite"', 'aria-busy="true"', 'loading-repair.png',
    'width="1212"', 'height="1297"', 'object-contain', 'max-w-80', 'max-h-[55dvh]', 'loading-bar-segment', props.description]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('aria-valuenow'));
  const png = readFileSync(new URL("../public/images/loading/loading-repair.png", import.meta.url));
  assert.equal(png.readUInt32BE(16), 1212);
  assert.equal(png.readUInt32BE(20), 1297);
  assert.equal(png[25], 6); // RGBA, retains the supplied alpha channel.
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none/);
  assert.match(css, /loading-bar-travel 1.4s ease-in-out infinite/);
});

test("overlay locks root/body scroll and touch then restores styles on close/unmount", () => {
  let effect;
  const listeners = new Map();
  const document = { body: { style: { overflow: "auto" } }, documentElement: { style: { overflow: "scroll" } },
    activeElement: null, addEventListener: (name, fn, opts) => { listeners.set(name, fn); assert.equal(opts.passive, false); },
    removeEventListener: name => listeners.delete(name) };
  const h = createHarness({ document, mocks: { react: { useRef: () => ({ current: null }), useEffect: fn => { effect = fn; } } } });
  const oldHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class {};
  try {
    const Overlay = h.load("src/components/LoadingOverlayVisual.tsx").default;
    Overlay({ open: true, title: "준비", description: "설명" });
    const cleanup = effect();
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(document.documentElement.style.overflow, "hidden");
    let prevented = false;
    listeners.get("touchmove")({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    cleanup();
    assert.equal(document.body.style.overflow, "auto");
    assert.equal(document.documentElement.style.overflow, "scroll");
    assert.equal(listeners.size, 0);
    Overlay({ open: false, title: "준비", description: "설명" });
    assert.equal(effect(), undefined);
  } finally { globalThis.HTMLElement = oldHTMLElement; }
});

test("start success/failure shows overlay during API and releases it with Q1/error; duplicate start calls share lock", async () => {
  for (const fail of [false, true]) {
    let resolve;
    const h = setup({ fetch: () => new Promise(done => { resolve = done; }) });
    const ui = runner(h, { 0: null, 1: "loading" });
    const starting = ui.start();
    await ui.start();
    assert.equal(h.requests.length, 1);
    assert.equal(ui.overlay().open, true);
    resolve(fail ? new Response(null, { status: 500 }) : Response.json({ attempt_id: h.state.progress.attemptId, write_token: "A".repeat(43) }, { status: 201 }));
    await starting;
    assert.equal(ui.overlay().open, false);
    if (fail) assert.ok(ui.state[4]);
    else { assert.equal(ui.state[1], "questions"); assert.equal(ui.state[0].currentQuestionIndex, 0); }
  }
});

test("background saves and restart drain do not open overlay; completion busy alone controls result overlay", () => {
  const h = setup();
  for (const status of ["pending", "saving", "error"]) {
    const ui = runner(h, { 8: status });
    assert.equal(ui.overlay().open, false);
  }
  assert.equal(runner(h, { 3: true, 10: true, 8: "saving" }).overlay().open, false);
  const completing = runner(h, { 2: true, 8: "saving" });
  assert.equal(completing.overlay().open, true);
  assert.equal(completing.overlay().description, "플레이스타일을 정리하고 있어요.");
  assert.ok(completing.render().some(node => node.props?.inert === true));
});

test("real Q24 handler stays busy throughout drain and complete; failure releases overlay condition", async () => {
  for (const failAt of ["drain", "complete", "none"]) {
    let resolveSave, resolveComplete;
    const h = setup({ fetch: (url, init) => new Promise(done => { resolveSave = () => done(failAt === "drain" ? new Response(null, { status: 500 }) : saved(init)); }),
      complete: () => new Promise((resolve, reject) => { resolveComplete = () => failAt === "complete" ? reject(new Error("failed")) : resolve(); }) });
    for (const [i, question] of h.questions.entries()) {
      h.render().handleSelect(question.choices[0].id);
      if (i < 23) await h.render().handleNext();
      assert.equal(h.state.navigating, false);
    }
    const completing = h.render().handleNext();
    await h.render().handleNext();
    assert.equal(h.state.navigating, true);
    for (let i = 0; i < (failAt === "drain" ? 1 : 24); i++) { resolveSave(); await tick(); }
    if (failAt !== "drain") { assert.equal(h.state.navigating, true); resolveComplete(); }
    await completing;
    assert.equal(h.state.navigating, failAt === "none");
    assert.equal(h.state.route, failAt === "none" ? "/result" : "");
    assert.equal(h.calls.filter(call => call === "complete").length, failAt === "drain" ? 0 : 1);
  }
});

test("landing shows the common overlay during route transition and blocks repeated CTA navigation", async () => {
  let pending = false, pushes = 0;
  const h = createHarness({ mocks: {
    react: { useEffect() {}, useTransition: () => [pending, callback => { pending = true; callback(); }] },
    "next/navigation": { useRouter: () => ({ push: path => { assert.equal(path, "/test"); pushes++; } }) },
  } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const Landing = h.load("src/components/LandingContent.tsx").default;
  const render = () => nodes(Landing());
  let tree = render();
  let link = tree.find(node => node.props?.href === "/test");
  link.props.onClick({ preventDefault() {} });
  link.props.onNavigate({ preventDefault() {} });
  tree = render();
  assert.equal(tree.find(node => node.props?.title === "테스트 준비 중").props.open, true);
  link = tree.find(node => node.props?.href === "/test");
  assert.equal(link.props["aria-disabled"], true);
  link.props.onClick({ preventDefault() {} });
  link.props.onNavigate({ preventDefault() {} });
  assert.equal(pushes, 1);
  assert.equal(h.events.filter(event => event.name === "cta_click").length, 1);
  pending = false;
  assert.equal(render().find(node => node.props?.title === "테스트 준비 중").props.open, false);
});
