import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

test("root layout supplies service metadata without nonexistent share images", () => {
  const h = createHarness({
    ssr: true,
    mocks: {
      "next/font/google": {
        Geist: () => ({ variable: "font-sans" }),
        Geist_Mono: () => ({ variable: "font-mono" }),
      },
      "./globals.css": {},
    },
  });
  const { metadata } = h.load("src/app/layout.tsx");
  const title = "PUBG 플레이스타일 테스트";
  const description = "24개의 상황 질문으로 알아보는 나의 PUBG 플레이스타일";

  assert.equal(metadata.metadataBase.href, "https://pubg-playstyle-test.vercel.app/");
  assert.equal(metadata.title, title);
  assert.equal(metadata.description, description);
  assert.deepEqual(metadata.openGraph, { title, description, type: "website", siteName: title });
  assert.deepEqual(metadata.twitter, { card: "summary", title, description });
});
