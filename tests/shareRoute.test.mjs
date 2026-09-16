import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

test("all 16 share routes prerender matching OG/Twitter titles and reuse the existing landing", async () => {
  const h = createHarness();
  const route = h.load("src/app/share/[mainType]/page.tsx");
  const results = Object.values(h.load("src/data/resultTypes.ts").resultTypes);
  assert.equal(results.length, 16);
  assert.deepEqual(route.generateStaticParams(), results.map(r => ({ mainType: r.id })));
  assert.equal(route.default().type, h.load("src/components/LandingContent.tsx").default);
  for (const result of results) {
    const metadata = await route.generateMetadata({ params: Promise.resolve({ mainType: result.id }) });
    const title = `내 배그 플레이 유형은 ${result.name}! 너는 어떤 유형일까?`;
    assert.equal(metadata.title, title);
    assert.equal(metadata.description, undefined); // Preserve the parent SEO description.
    for (const card of [metadata.openGraph, metadata.twitter]) {
      assert.equal(card.title, title);
      assert.doesNotMatch(card.title, /[\r\n]/);
      assert.equal(card.description, "");
      assert.deepEqual(card.images, ["/images/og/og-default.png"]);
    }
  }
});

test("unknown and prototype keys inherit common metadata and cannot enter generated share URLs", async () => {
  const h = createHarness();
  const route = h.load("src/app/share/[mainType]/page.tsx");
  const { createSharePayload } = h.load("src/lib/shareResult.ts");
  for (const mainType of ["unknown", "constructor", "__proto__", "../result?write_token=secret"]) {
    assert.deepEqual(await route.generateMetadata({ params: Promise.resolve({ mainType }) }), {});
    const url = new URL(createSharePayload("https://example.invalid/", mainType).url);
    assert.equal(url.pathname, "/");
    assert.equal(url.searchParams.size, 3);
    assert.ok(!url.href.includes("secret"));
  }
});

test("share landing captures UTM once and preserves attribution on test navigation", () => {
  const h = createHarness();
  const { createSharePayload } = h.load("src/lib/shareResult.ts");
  const { getVisitorContext } = h.load("src/lib/visitorContext.ts");
  const id = "position-support-design-risk";
  const payload = createSharePayload("https://example.invalid/result?attempt_id=secret&anonymous_id=secret&session_id=secret&write_token=secret#private", id);
  h.window.location.href = payload.url;
  const initial = getVisitorContext();
  assert.equal(initial.initial_source, "share");
  assert.equal(initial.initial_medium, "user_share");
  assert.equal(initial.initial_campaign, "launch");
  assert.equal(initial.landing_page, `/share/${id}`);
  assert.ok(!/secret|private|attempt_id|anonymous_id|session_id|write_token/.test(payload.url));
  h.window.location.href = "https://example.invalid/test";
  assert.deepEqual(getVisitorContext(), initial);
});
