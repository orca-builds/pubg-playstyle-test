import { imageText, regular, bold } from "./helpers/resultImageText.mjs";
import fontkit from "next/dist/compiled/@next/font/dist/fontkit/index.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const summaryFont = fontkit.default(bold);
const bodyFont = fontkit.default(regular);
const measure = (text, size = 36, font = summaryFont) => font.layout(text).advanceWidth * size / font.unitsPerEm;

test("requested summaries use pixel widths, preserve words, and avoid isolated final tokens", () => {
  const split = createHarness().load("src/lib/splitImageText.ts").splitImageText;
  for (const text of [
    "좋은 자리를 먼저 보고 안전하게 팀의 이동 공간을 만드는 플레이어",
    "과감한 움직임과 새로운 각으로 교전의 변수를 만드는 플레이어",
    "운영을 기본으로 하되 필요하면 예상 밖의 선택으로 판을 바꾸는 플레이어",
    "싸움이 보이면 직접 판을 열고 빠르게 승부를 보는 플레이어",
  ]) {
    const lines = split(text, 932, measure);
    assert.equal(lines.length, measure(text) <= 932 ? 1 : 2);
    assert.equal(lines.join(" "), text);
    assert.ok(lines.every(line => measure(line) <= 932));
    assert.ok(lines.at(-1).endsWith("플레이어"));
    assert.ok(lines.at(-1).split(" ").length > 1);
    if (lines.length === 2) assert.ok(Math.abs(measure(lines[0]) - measure(lines[1])) < 160);
  }
  assert.deepEqual(split("팀을 지키는 플레이어", 932, measure), ["팀을 지키는 플레이어"]);
  // Equal character counts have different widths: this cannot be a length heuristic.
  const narrow = "iiii iiii", wide = "WWWW WWWW";
  const limit = measure(narrow);
  assert.deepEqual(split(narrow, limit, measure), [narrow]);
  assert.notEqual(measure(narrow), measure(wide));
  assert.throws(() => split("너무긴단일단어", 1, measure), /IMAGE_TEXT_OVERFLOW/);
});

test("all result text preserves words, centered layout and card dimensions", () => {
  const h = createHarness();
  const Card = h.load("src/components/ResultImageCard.tsx").default;
  for (const mainResult of Object.values(h.load("src/data/resultTypes.ts").resultTypes)) {
    const card = Card({ textLines: imageText(mainResult), result: { mainResult, displaySubTags: ["본대형", "대꼴형"] } });
    const lines = imageText(mainResult);
    assert.ok(lines.name.every(line => measure(line, 68) <= 932));
    assert.ok(lines.summary.every(line => measure(line) <= 932));
    assert.ok(lines.description.every(line => measure(line, 28, bodyFont) <= 932));
    const occupiedHeight = 96 + 120 + 48 + lines.name.length * 88 + 56 + 560 + lines.summary.length * 52 + lines.description.length * 42 + 36;
    assert.ok(occupiedHeight <= 1350, `${mainResult.name}: ${occupiedHeight}px`);
    assert.equal(card.props.style.width, 1080);
    assert.equal(card.props.style.height, 1350);
    const children = card.props.children;
    for (const [index, text] of [[1, mainResult.name], [4, mainResult.summary]]) {
      const block = children[index];
      assert.equal(block.props.children.split("\n").length <= 2, true);
      assert.equal(block.props.children.split(/\s+/).join(" "), text);
      assert.equal(block.props.style.whiteSpace, "pre");
      assert.equal(block.props.style.flexShrink, 0);
    }
    assert.equal(card.props.style.textAlign, "center");
    const description = children[5];
    assert.equal(description.type, "p");
    assert.equal(description.props.style.whiteSpace, "pre");
    assert.deepEqual(description.props.children.split(/\s+/), mainResult.description.split(/\s+/));

    assert.equal(children[6].props.style.marginTop, "auto");
  }
});

test("representative types render real 1080x1350 ImageResponse PNGs", async () => {
  const h = createHarness();
  const { GET } = h.load("src/app/api/result-image/route.ts");
  const types = Object.values(h.load("src/data/resultTypes.ts").resultTypes);
  for (const name of ["변수 창출대장", "안정형 선점대장", "화끈한 돌격대장", "변수 운영가"]) {
    const type = types.find(result => result.name === name);
    const response = await GET(new Request(`https://example.invalid/api/result-image?main_type=${type.id}&tag=mainBodyFlank.mainBody&tag=hotdropTail.hotdrop`, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0" } }));
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1350);
    const iphoneResponse = await GET(new Request(`https://example.invalid/api/result-image?main_type=${type.id}&tag=mainBodyFlank.mainBody&tag=hotdropTail.hotdrop`, { headers: { "user-agent": "iPhone" } }));
    assert.equal(iphoneResponse.status, 200);
    assert.equal(iphoneResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await iphoneResponse.arrayBuffer()), bytes, "same final PNG regardless of platform");
  }
});
