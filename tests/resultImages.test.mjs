import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";

test("all 16 explicit image mappings match numbered files and square PNG dimensions", () => {
  const h = createHarness();
  const results = h.load("src/data/resultTypes.ts").resultTypes;
  const files = readdirSync(new URL("../public/images/results/", import.meta.url)).filter(f => f.endsWith(".png")).sort();
  const ids = [];
  for (const a of ["combat", "position"]) for (const b of ["frontline", "support"])
    for (const c of ["pressure", "design"]) for (const d of ["risk", "safe"]) ids.push(`${a}-${b}-${c}-${d}`);
  assert.deepEqual(Object.keys(results), ids);
  assert.equal(files.length, 16);
  assert.equal(new Set(Object.values(results).map(r => r.imageSrc)).size, 16);
  ids.forEach((id, i) => {
    const file = `${String(i + 1).padStart(2, "0")}_${id}.png`;
    assert.equal(files[i], file);
    assert.equal(results[id].id, id);
    assert.equal(results[id].imageSrc, `/images/results/${file}`);
    assert.equal(results[id].imageAlt, `${results[id].name} 캐릭터 이미지`);
    const png = readFileSync(new URL(`../public/images/results/${file}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(png.readUInt32BE(16) > 0);
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
  });
});

test("missing/malformed sources render fallback; load errors preserve reserved space and a new source recovers", () => {
  let failed = null;
  const h = createHarness({ mocks: { react: { useState: () => [failed, value => { failed = value; }] } } });
  const Character = h.load("src/components/ResultCharacter.tsx").default;
  for (const src of [null, undefined, "", "https://invalid.example/image.png", "/bad.png"]) {
    const tree = Character({ src, name: "테스트" });
    assert.equal(tree.props.children.type, "svg");
  }
  const src = "/images/results/01_combat-frontline-pressure-risk.png";
  const tree = Character({ src, name: "테스트" });
  const img = tree.props.children;
  assert.equal(img.props.src, src);
  assert.equal(img.props.alt, "테스트 캐릭터 이미지");
  assert.equal(img.props.width, img.props.height);
  assert.match(img.props.className, /object-contain/);
  assert.match(tree.props.className, /aspect-square w-full max-w-\[280px\]/);
  assert.match(tree.props.className, /sm:max-w-\[304px\]/);
  assert.equal(img.props.width, 304);
  img.props.onError();
  const fallback = Character({ src, name: "테스트" });
  assert.equal(fallback.props.children.type, "svg");
  assert.equal(fallback.props.className, tree.props.className);
  const next = Character({ src: "/images/results/16_position-support-design-safe.png", name: "다른 결과" });
  assert.equal(next.props.children.props.alt, "다른 결과 캐릭터 이미지");
});

test("result content renders mapped image below name and above details and switches image/key for a new attempt", () => {
  const h = createHarness();
  const Content = h.load("src/components/ResultContent.tsx").default;
  const results = Object.values(h.load("src/data/resultTypes.ts").resultTypes);
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  const result = h.load("src/lib/scoring.ts").calculateScore(questions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id })));
  const trees = [results[0], results[15]].map((mainResult, i) => Content({
    snapshot: { status: "ready", attemptId: `attempt-${i}`, result: { ...result, mainResult } },
    onShare() {}, onStartTest() {}, onRetryLoad() {},
  }));
  const images = trees.map(tree => tree.props.children.find(child => child?.props?.src));
  assert.notEqual(images[0].key, images[1].key);
  assert.equal(images[0].props.src, results[0].imageSrc);
  assert.equal(images[1].props.src, results[15].imageSrc);
  for (const tree of trees) {
    const html = renderToStaticMarkup(tree);
    assert.ok(html.indexOf("<h2") < html.indexOf("<img"));
    assert.ok(html.indexOf("<img") < html.indexOf("보조 성향 태그"));
    assert.ok(html.includes("object-contain"));
  }
  // Malformed result snapshots keep the existing safe result recovery UI.
  const invalid = renderToStaticMarkup(createElement(Content, { snapshot: { status: "invalid" }, onShare() {}, onStartTest() {}, onRetryLoad() {} }));
  assert.ok(!invalid.includes("<img"));
  assert.ok(invalid.includes("결과를 불러오지 못했습니다"));
});
