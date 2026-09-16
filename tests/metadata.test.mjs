import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createHarness } from "./helpers/analyticsHarness.mjs";

test("root layout uses the common OG image and file-based helmet icons", () => {
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
  const images = ["/images/og/og-default.png"];
  assert.deepEqual(metadata.openGraph, { title, description: "", type: "website", siteName: title, images });
  assert.deepEqual(metadata.twitter, { card: "summary_large_image", title, description: "", images });
  assert.equal(metadata.icons, undefined);
  assert.equal(existsSync(new URL("../src/app/favicon.ico", import.meta.url)), false);
  for (const path of ["public/images/og/og-default.png", "src/app/icon.png", "src/app/apple-icon.png"]) {
    const png = readFileSync(new URL(`../${path}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});
