import assert from "node:assert/strict";
import test from "node:test";
import { configured, createHarness, memoryStorage } from "./helpers/analyticsHarness.mjs";

test("anonymous UUID and first attribution survive reload and different UTM entry", () => {
  const localStorage = memoryStorage();
  const first = createHarness({ localStorage, href: "https://example.invalid/?utm_source=discord&utm_medium=social&utm_campaign=launch&email=private", referrer: "https://referrer.invalid/private?token=private" });
  const a = first.load("src/lib/visitorContext.ts").getVisitorContext();
  const next = createHarness({ localStorage, href: "https://example.invalid/test?utm_source=other" });
  const b = next.load("src/lib/visitorContext.ts").getVisitorContext();
  assert.match(a.anonymous_id, /^[0-9a-f-]{36}$/);
  assert.equal(a.anonymous_id, b.anonymous_id);
  assert.equal(b.initial_source, "discord");
  assert.equal(b.initial_medium, "social");
  assert.equal(b.initial_campaign, "launch");
  assert.equal(b.initial_referrer, "https://referrer.invalid");
  assert.equal(b.landing_page, "/");
  assert.ok(!JSON.stringify(b).includes("private"));
  assert.notEqual(a.session_id, b.session_id);
});

test("session UUID survives reload; fresh tab storage gets a new UUID", () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const a = createHarness({ localStorage, sessionStorage }).load("src/lib/visitorContext.ts").getVisitorContext();
  const b = createHarness({ localStorage, sessionStorage }).load("src/lib/visitorContext.ts").getVisitorContext();
  const c = createHarness({ localStorage }).load("src/lib/visitorContext.ts").getVisitorContext();
  assert.equal(a.session_id, b.session_id);
  assert.notEqual(a.session_id, c.session_id);
});

test("direct entry, device classification and malformed context are safe", () => {
  for (const [userAgent, device] of [["iPhone Mobile", "mobile"], ["Android Tablet", "tablet"], ["Desktop", "desktop"]]) {
    const harness = createHarness({ userAgent });
    const context = harness.load("src/lib/visitorContext.ts");
    harness.window.localStorage.setItem(context.VISITOR_KEY, "{broken");
    const value = context.getVisitorContext();
    assert.equal(value.device_type, device);
    assert.equal(value.initial_source, "direct");
    assert.equal(value.initial_medium, "none");
    assert.equal(value.initial_referrer, "");
  }
});

test("denied context storage uses stable document memory without throwing", () => {
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const harness = createHarness({ localStorage: denied, sessionStorage: denied });
  const context = harness.load("src/lib/visitorContext.ts");
  assert.deepEqual(context.getVisitorContext(), context.getVisitorContext());
});

test("missing, partial, blank, malformed config is no-op without loading the SDK", async () => {
  for (const env of [
    {}, { NEXT_PUBLIC_POSTHOG_KEY: configured.NEXT_PUBLIC_POSTHOG_KEY },
    { NEXT_PUBLIC_POSTHOG_HOST: configured.NEXT_PUBLIC_POSTHOG_HOST },
    { ...configured, NEXT_PUBLIC_POSTHOG_KEY: " " },
    { ...configured, NEXT_PUBLIC_POSTHOG_HOST: " " },
    { ...configured, NEXT_PUBLIC_POSTHOG_HOST: "invalid" },
    { ...configured, NEXT_PUBLIC_POSTHOG_HOST: "file:///tmp/analytics" },
  ]) {
    const harness = createHarness({ env });
    const analytics = harness.load("src/lib/analytics.ts");
    await analytics.initializeAnalytics();
    assert.equal(analytics.trackEvent("test_start"), false);
    assert.equal(harness.imports, 0);
    assert.equal(harness.events.length, 0);
  }
});

test("SSR never loads SDK or creates browser context", async () => {
  const harness = createHarness({ ssr: true });
  const analytics = harness.load("src/lib/analytics.ts");
  await analytics.initializeAnalytics();
  assert.equal(analytics.trackEvent("test_start"), false);
  assert.equal(harness.load("src/lib/visitorContext.ts").getVisitorContext(), undefined);
  assert.equal(harness.imports, 0);
});

test("concurrent init shares one SDK and early events retain their original attempt and URL", async () => {
  const harness = createHarness();
  const analytics = harness.load("src/lib/analytics.ts");
  const first = analytics.initializeAnalytics();
  assert.equal(analytics.initializeAnalytics(), first);
  analytics.trackEvent("retry_click", { attempt_id: "old" });
  harness.window.location.href = "https://example.invalid/test";
  analytics.trackEvent("test_start", { attempt_id: "new" });
  await first;
  await analytics.initializeAnalytics();
  assert.equal(harness.initCalls.length, 1);
  assert.equal(harness.events.length, 2);
  assert.equal(harness.events[0].properties.attempt_id, "old");
  assert.equal(harness.events[0].properties.$current_url, "https://example.invalid/");
  assert.equal(harness.events[1].properties.attempt_id, "new");
  assert.equal(harness.events[1].properties.test_version, harness.load("src/data/questions.ts").questionSet.version);
  assert.equal(harness.events[0].properties.anonymous_id, harness.events[1].properties.anonymous_id);
  const config = harness.initCalls[0][1];
  assert.equal(config.capture_pageview, "history_change");
  for (const key of ["autocapture", "capture_pageleave", "rageclick", "capture_dead_clicks", "capture_heatmaps", "capture_performance", "capture_exceptions", "debug"]) assert.equal(config[key], false, key);
  for (const key of ["disable_session_recording", "disable_surveys", "advanced_disable_flags"]) assert.equal(config[key], true, key);
});

test("SDK errors never propagate; failed init clears queue and never retries", async () => {
  for (const failure of ["loadError", "initError", "captureError"]) {
    const harness = createHarness({ [failure]: true });
    const analytics = harness.load("src/lib/analytics.ts");
    assert.doesNotThrow(() => analytics.trackEvent("test_start"));
    await assert.doesNotReject(analytics.initializeAnalytics());
    assert.doesNotThrow(() => analytics.trackEvent("test_complete"));
    await analytics.initializeAnalytics();
    assert.equal(harness.imports, 1);
    assert.equal(harness.events.length, 0);
  }
});

test("SDK loading queue is bounded", async () => {
  const harness = createHarness();
  const analytics = harness.load("src/lib/analytics.ts");
  for (let i = 0; i < 100; i++) assert.equal(analytics.trackEvent("cta_click"), true);
  assert.equal(analytics.trackEvent("cta_click"), false);
  await analytics.initializeAnalytics();
  assert.equal(harness.events.length, 100);
});

test("landing once flag survives Strict Mode, remount and refresh in the same session", async () => {
  const sessionStorage = memoryStorage();
  const localStorage = memoryStorage();
  for (let i = 0; i < 2; i++) {
    const harness = createHarness({ sessionStorage, localStorage });
    const analytics = harness.load("src/lib/analytics.ts");
    const { session_id } = harness.load("src/lib/visitorContext.ts").getVisitorContext();
    const once = { scope: "sessionStorage", key: `landing:${session_id}` };
    analytics.trackEvent("landing_view", {}, once);
    analytics.trackEvent("landing_view", {}, once);
    await analytics.initializeAnalytics();
    assert.equal(harness.events.length, i === 0 ? 1 : 0);
  }
});

test("SDK URL and referrer properties discard arbitrary query/hash data", async () => {
  const harness = createHarness();
  await harness.load("src/lib/analytics.ts").initializeAnalytics();
  const event = { properties: {
    $current_url: "https://example.invalid/test?email=private#private",
    $referrer: "https://referrer.invalid/private?secret=private",
    $set_once: { $initial_current_url: "https://example.invalid/?email=private", utm_term: "private" },
  } };
  const sanitized = harness.initCalls[0][1].before_send(event);
  assert.ok(!JSON.stringify(sanitized).includes("private"));
  assert.equal(sanitized.properties.$current_url, "https://example.invalid/test");
});
