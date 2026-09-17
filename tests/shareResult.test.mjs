import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createHarness, memoryStorage } from "./helpers/analyticsHarness.mjs";

const context = { attemptId: "private-attempt", testVersion: "v2", mainType: "combat-frontline-pressure-risk", typeName: "화끈한 돌격대장" };
const href = "https://example.invalid/result?attempt_id=private-attempt&write_token=private-token&anonymous_id=private-visitor&session_id=private-session#raw-score";
function setup(options = {}) {
  const h = createHarness(options);
  return { ...h, ...h.load("src/lib/shareResult.ts"), init: h.load("src/lib/analytics.ts").initializeAnalytics };
}

test("share campaigns use only the initial campaign and preserve route, UTM, and URL privacy", () => {
  const h = setup();
  for (const [initial, expected] of [
    ["prelaunch", "prelaunch_referral"], ["prelaunch_referral", "prelaunch_referral"],
    ["launch", "launch"], [undefined, "launch"], ["", "launch"], ["direct", "launch"], ["other", "launch"],
  ]) {
    assert.equal(h.getShareCampaign(initial), expected);
    for (const mainType of Object.keys(h.load("src/data/resultTypes.ts").resultTypes)) {
      assert.deepEqual(h.createSharePayload(href, mainType, initial), {
        url: `https://example.invalid/share/${mainType}?utm_source=share&utm_medium=user_share&utm_campaign=${expected}`,
      });
    }
  }
});

test("sharing uses preserved first attribution after 24 hours, root visits, and later launch UTM", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const localStorage = memoryStorage(), sessionStorage = memoryStorage();
  const first = setup({ localStorage, sessionStorage,
    href: "https://example.invalid/?utm_source=friend&utm_medium=smoke_test&utm_campaign=prelaunch" });
  const initial = first.load("src/lib/visitorContext.ts").getVisitorContext();
  t.mock.timers.tick(48 * 60 * 60 * 1000);
  for (const entry of ["https://example.invalid/", "https://example.invalid/?utm_source=discord&utm_medium=community&utm_campaign=launch"]) {
    const h = setup({ localStorage, sessionStorage, href: entry });
    assert.deepEqual(h.load("src/lib/visitorContext.ts").getVisitorContext(), initial);
    let shared, copied;
    await h.shareResult(context, { async share(data) { shared = data.url; } }, href);
    await h.shareResult(context, { clipboard: { async writeText(url) { copied = url; } } }, href);
    assert.equal(new URL(shared).searchParams.get("utm_campaign"), "prelaunch_referral");
    assert.equal(copied, shared);
    await h.init();
    assert.deepEqual(h.events.map(e => e.name), ["share_click", "share_success", "share_click", "copy_link"]);
    for (const { properties } of h.events) {
      assert.equal(properties.initial_source, "friend");
      assert.equal(properties.initial_medium, "smoke_test");
      assert.equal(properties.initial_campaign, "prelaunch");
    }
  }
});

test("prelaunch referral chain stays referral for new visitors", async () => {
  let entry = "https://example.invalid/?utm_source=friend&utm_medium=smoke_test&utm_campaign=prelaunch";
  for (let generation = 0; generation < 3; generation++) {
    const h = setup({ href: entry });
    const initial = h.load("src/lib/visitorContext.ts").getVisitorContext();
    assert.equal(initial.initial_campaign, generation === 0 ? "prelaunch" : "prelaunch_referral");
    await h.shareResult(context, { async share(data) { entry = data.url; } }, href);
    assert.equal(entry, `https://example.invalid/share/${context.mainType}?utm_source=share&utm_medium=user_share&utm_campaign=prelaunch_referral`);
  }
});

test("launch and direct visitors share launch without rewriting initial attribution, even without analytics", async () => {
  for (const campaign of ["launch", "", "direct", "other"]) {
    const h = setup({ env: {}, href: campaign
      ? `https://example.invalid/?utm_source=discord&utm_medium=community&utm_campaign=${campaign}`
      : "https://example.invalid/" });
    const getContext = h.load("src/lib/visitorContext.ts").getVisitorContext;
    const initial = getContext();
    let url;
    await h.shareResult(context, { async share(data) { url = data.url; } }, href);
    assert.equal(new URL(url).searchParams.get("utm_campaign"), "launch");
    assert.deepEqual(getContext(), initial);
    assert.equal(initial.initial_campaign, campaign);
    if (!campaign) {
      assert.equal(initial.initial_source, "direct");
      assert.equal(initial.initial_medium, "none");
    }
  }
});

test("Web Share receives only the public share URL and records click then success", async () => {
  const h = setup();
  let payload;
  const browser = { async share(data) { assert.equal(this, browser); payload = data; } };
  assert.equal(await h.shareResult(context, browser, href), "shared");
  assert.deepEqual(payload, {
    url: `https://example.invalid/share/${context.mainType}?utm_source=share&utm_medium=user_share&utm_campaign=launch` });
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

test("all 16 result types generate URL-only payloads with unchanged UTM", () => {
  const h = setup();
  const results = Object.values(h.load("src/data/resultTypes.ts").resultTypes);
  assert.equal(results.length, 16);
  for (const result of results) {
    const payload = h.createSharePayload(href, result.id);
    assert.deepEqual(Object.keys(payload), ["url"]);
    assert.equal(payload.url, `https://example.invalid/share/${result.id}?utm_source=share&utm_medium=user_share&utm_campaign=launch`);
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

test("unsupported Web Share copies only URL and records copy_link only after success", async () => {
  const h = setup();
  let copied;
  assert.equal(await h.shareResult(context, { clipboard: { async writeText(value) { copied = value; } } }, href), "copied");
  const payload = h.createSharePayload(href, context.mainType);
  assert.equal(copied, payload.url);
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
