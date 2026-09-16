import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const h = createHarness();
const Content = h.load("src/components/ResultContent.tsx").default;
const Bars = h.load("src/components/MainAxisBars.tsx").default;
const { getAxisEmphasis } = h.load("src/lib/axisEmphasis.ts");
const { supportTagDescriptions } = h.load("src/data/supportTagDescriptions.ts");
const { subTraitTags, allRounderTag } = h.load("src/data/subTraits.ts");
const resultTypes = Object.values(h.load("src/data/resultTypes.ts").resultTypes);
const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
const result = h.load("src/lib/scoring.ts").calculateScore(questions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id })));

function render(mainResult, displaySubTags = result.displaySubTags) {
  return renderToStaticMarkup(createElement(Content, {
    snapshot: { status: "ready", attemptId: "polish", result: { ...result, mainResult, displaySubTags } },
    onStartTest() {}, onRetryLoad() {}, onShare() {},
  }));
}

test("all 16 results retain original copy and follow the requested information hierarchy", () => {
  assert.equal(resultTypes.length, 16);
  for (const mainResult of resultTypes) {
    const html = render(mainResult);
    const positions = ["당신의 배그 플레이 유형은", mainResult.name, "<img", mainResult.summary,
      mainResult.description, "세부 플레이 성향", "보조 성향 태그", "나의 플레이 성향",
      "결과 공유하기", "친구와 결과를 비교해보세요", "다시 하기"].map(text => {
      const index = html.indexOf(text);
      assert.ok(index >= 0, `${mainResult.id}: ${text}`);
      return index;
    });
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
    for (const tag of result.displaySubTags) assert.ok(html.includes(supportTagDescriptions[tag]));
  }
});

test("all existing tags, including neutral and all-rounder, have a short UI description", () => {
  const tags = [...Object.values(subTraitTags).flatMap(Object.values), allRounderTag];
  assert.equal(tags.length, 16);
  assert.deepEqual(Object.keys(supportTagDescriptions).sort(), [...tags].sort());
  for (const tag of tags) {
    const description = supportTagDescriptions[tag];
    assert.ok(description.length >= 15 && description.length <= 30, tag);
    assert.ok(render(resultTypes[0], [tag]).includes(description));
  }
  // Preserve scoring's one-tag all-rounder result instead of inventing a second tag.
  const html = render(resultTypes[0], [allRounderTag]);
  assert.equal(html.split(supportTagDescriptions[allRounderTag]).length - 1, 1);
});

test("all four axes emphasize the dominant label while close percentages stay equally visible", () => {
  for (const [first, second, expected] of [[100, 0, "first"], [60, 40, "first"],
    [40, 60, "second"], [0, 100, "second"], [50, 50, "balanced"],
    [51, 49, "balanced"], [49, 51, "balanced"], [55, 45, "balanced"],
    [45, 55, "balanced"], [56, 44, "first"], [44, 56, "second"]]) {
    assert.equal(getAxisEmphasis(first, second), expected);
    const percentages = { combat: first, position: second, frontline: first, support: second,
      pressure: first, design: second, risk: first, safe: second };
    const tree = Bars({ percentages });
    const rows = tree.props.children[1].props.children;
    assert.equal(rows.length, 4);
    for (const row of rows) {
      const [left, right] = row.props.children[0].props.children;
      assert.equal(left.props.className.includes("opacity-65"), expected === "second");
      assert.equal(right.props.className.includes("opacity-65"), expected === "first");
      const spans = row.props.children[1].props.children.props.children;
      assert.equal(spans[0].props.className.includes("opacity-65"), expected === "second");
      assert.equal(spans[1].props.className.includes("opacity-65"), expected === "first");
      assert.equal(spans[0].props.style.width, `${first}%`);
      assert.equal(spans[1].props.style.width, `${second}%`);
    }
  }
});

test("support cards share top alignment and the share CTA keeps text, focus and motion safeguards", () => {
  const tree = Content({ snapshot: { status: "ready", attemptId: "layout", result },
    onStartTest() {}, onRetryLoad() {}, onShare() {} });
  const section = tree.props.children.find(child => child?.props?.["aria-labelledby"] === "support-traits-title");
  const list = section.props.children[1];
  assert.match(list.props.className, /auto-rows-fr/);
  const cards = list.props.children;
  assert.equal(cards.length, 2);
  assert.equal(cards[0].props.className, cards[1].props.className);
  for (const card of cards) {
    assert.match(card.props.className, /flex-col items-start gap-2/);
    assert.match(card.props.className, /min-h-\[108px\]/);
    assert.match(card.props.children[0].props.className, /leading-5/);
    assert.match(card.props.children[1].props.className, /leading-6/);
    for (const child of card.props.children) assert.match(child.props.className, /px-2\.5/);
  }
  const button = tree.props.children.at(-1).props.children[0];
  assert.equal(button.props.children[1].props.children, "결과 공유하기");
  assert.equal(button.props.children[0].props["aria-hidden"], "true");
  assert.equal(button.props.children[0].props.focusable, "false");
  assert.match(button.props.className, /inline-flex items-center justify-center gap-2/);
  assert.match(button.props.children[0].props.className, /block size-5 shrink-0/);
  assert.match(button.props.children[1].props.className, /leading-5/);
  assert.match(button.props.className, /focus-visible:outline-2/);
  assert.match(button.props.className, /motion-safe:enabled:hover:scale-\[1\.02\]/);
  assert.match(button.props.className, /motion-safe:enabled:active:scale-\[0\.98\]/);
  assert.match(button.props.className, /motion-reduce:transition-none/);
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.equal(button.props.children.length, 2);
  assert.match(button.props.className, /result-share-attention/);
  assert.equal(button.props.ref, h.load("src/lib/observeShareAttention.ts").observeShareAttention);
  assert.equal(button.props["data-share-attention"], undefined);
  assert.doesNotMatch(css, /result-share-(cue|cursor|tap|nudge)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.result-share-attention\[data-share-attention="started"\]\s*\{\s*animation: result-share-attention 800ms ease-in-out 800ms 2;/);
  assert.match(css, /50%\s*\{\s*scale: 1\.015;/);
  assert.match(css, /0%, 100%\s*\{\s*scale: 1;/);
  assert.match(css, /:enabled:hover\s*\{\s*scale: 1\.02 !important;/);
  assert.match(css, /:enabled:active\s*\{\s*scale: 0\.98 !important;/);
  assert.match(css, /:disabled\s*\{\s*scale: 1 !important;/);
});
