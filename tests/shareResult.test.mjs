import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const context = { attemptId: "private-attempt", testVersion: "v2", mainType: "type-id", typeName: "돌격 대장" };
const href = "https://example.invalid/result?attempt_id=private-attempt&write_token=private-token&anonymous_id=private-visitor&session_id=private-session#raw-score";
function setup(options = {}) {
  const h = createHarness(options);
  return { ...h, ...h.load("src/lib/shareResult.ts"), init: h.load("src/lib/analytics.ts").initializeAnalytics };
}

test("Web Share receives only title/text/public landing URL and records click then success", async () => {
  const h = setup();
  let payload;
  const browser = { async share(data) { assert.equal(this, browser); payload = data; } };
  assert.equal(await h.shareResult(context, browser, href), "shared");
  assert.deepEqual(payload, { title: "PUBG 플레이스타일 테스트",
    text: "내 배그 플레이 유형은 돌격 대장!\n너는 어떤 유형인지 한번 해봐 👇",
    url: "https://example.invalid/?utm_source=share&utm_medium=user_share&utm_campaign=launch" });
  assert.ok(!JSON.stringify(payload).includes("private-"));
  assert.ok(!JSON.stringify(payload).includes("raw-score"));
  await h.init();
  assert.deepEqual(h.events.map(e => e.name), ["share_click", "share_success"]);
  for (const e of h.events) {
    assert.equal(e.properties.attempt_id, context.attemptId);
    assert.equal(e.properties.main_type, context.mainType);
    assert.equal(e.properties.share_method, "web_share");
    assert.ok(!JSON.stringify(e).includes("private-token"));
  }
});

test("Web Share cancellation produces only click, no clipboard or error outcome", async () => {
  const h = setup();
  assert.equal(await h.shareResult(context, {
    async share() { throw new DOMException("private-detail", "AbortError"); },
    clipboard: { async writeText() { assert.fail("No automatic copy on cancellation"); } },
  }, href), "cancelled");
  await h.init();
  assert.deepEqual(h.events.map(e => e.name), ["share_click"]);
});

test("unsupported Web Share copies text and URL and records copy_link only after success", async () => {
  const h = setup();
  let copied;
  assert.equal(await h.shareResult(context, { clipboard: { async writeText(value) { copied = value; } } }, href), "copied");
  const payload = h.createSharePayload(context.typeName, href);
  assert.equal(copied, `${payload.text}\n${payload.url}`);
  await h.init();
  assert.deepEqual(h.events.map(e => [e.name, e.properties.share_method]), [
    ["share_click", "clipboard"], ["copy_link", "clipboard"],
  ]);
});

test("share/clipboard rejection and missing clipboard return safe errors and allow later retry", async () => {
  for (const browser of [{}, { clipboard: { async writeText() { throw new Error("private-detail"); } } },
    { share() { throw new DOMException("private-detail", "NotAllowedError"); } }]) {
    const h = setup();
    assert.equal(await h.shareResult(context, browser, href), "error");
    await h.init();
    assert.deepEqual(h.events.map(e => e.name), ["share_click"]);
    assert.equal(await h.shareResult(context, { async share() {} }, href), "shared");
  }
});

test("analytics failure does not prevent sharing", async () => {
  const h = setup({ captureError: true });
  let called = false;
  assert.equal(await h.shareResult(context, { async share() { called = true; } }, href), "shared");
  assert.equal(called, true);
  await h.init();
  assert.deepEqual(h.events, []);
});

test("actual handler blocks rapid duplicate clicks and retry overlap, clears busy state after failure", async () => {
  const source = ts.createSourceFile("ResultPreview.tsx", readFileSync(new URL("../src/components/ResultPreview.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let code;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleShare") code = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let resolve, calls = 0;
  const state = {};
  const deps = { sharing: { current: false }, retrying: { current: false }, previousResult: null,
    snapshot: { status: "ready", attemptId: context.attemptId, result: { testVersion: "v2", mainResult: { id: context.mainType, name: context.typeName } } },
    setIsSharing: value => { state.busy = value; }, setShareOutcome: value => { state.outcome = value; },
    shareResult: value => { assert.deepEqual(value, context); calls++; return new Promise(done => { resolve = done; }); },
  };
  const click = new Function("deps", `const {${Object.keys(deps).join(",")}} = deps; ${code}; return handleShare;`)(deps);
  const first = click();
  await click();
  assert.equal(calls, 1);
  assert.equal(state.busy, true);
  resolve("error");
  await first;
  assert.equal(state.busy, false);
  assert.equal(state.outcome, "error");
  deps.retrying.current = true;
  await click();
  assert.equal(calls, 1);
  deps.retrying.current = false;
  const retry = click();
  resolve("copied");
  await retry;
  assert.equal(calls, 2);
  assert.equal(state.outcome, "copied");
});
