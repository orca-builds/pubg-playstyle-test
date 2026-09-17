import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

test("short text stays on one line; long text balances whole words across two lines", () => {
  const split = createHarness().load("src/lib/splitImageText.ts").splitImageText;
  assert.equal(split("팀을 지키는 플레이어", 26), "팀을 지키는 플레이어");
  const text = "과감한 움직임과 새로운 각으로 교전의 변수를 만드는 플레이어";
  const lines = split(text, 26).split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines.join(" "), text);
  assert.equal(lines[1].endsWith("플레이어"), true);
  assert.ok(Math.abs(lines[0].length - lines[1].length) <= 3);
  assert.equal(split("매우긴단일단어", 3), "매우긴단일단어");
  assert.equal(split("아주 긴 이름의 새로운 플레이 대장", 13).split("\n").length, 2);
});

test("all result text preserves words, centered layout and card dimensions", () => {
  const h = createHarness();
  const Card = h.load("src/components/ResultImageCard.tsx").default;
  for (const mainResult of Object.values(h.load("src/data/resultTypes.ts").resultTypes)) {
    const card = Card({ result: { mainResult, displaySubTags: ["본대형", "대꼴형"] } });
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
    assert.equal(description.props.style.flexWrap, "wrap");
    assert.deepEqual(description.props.children.map(word => word.props.children), mainResult.description.split(/\s+/));
    assert.ok(description.props.children.every(word => word.props.style.whiteSpace === "nowrap"));
    assert.equal(children[6].props.style.marginTop, "auto");
  }
});

test("representative types render real 1080x1350 ImageResponse PNGs", async () => {
  const h = createHarness();
  const { GET } = h.load("src/app/api/result-image/route.ts");
  const types = Object.values(h.load("src/data/resultTypes.ts").resultTypes);
  for (const name of ["변수 창출대장", "안정형 선점대장", "화끈한 돌격대장"]) {
    const type = types.find(result => result.name === name);
    const response = await GET(new Request(`https://example.invalid/api/result-image?main_type=${type.id}&tag=mainBodyFlank.mainBody&tag=hotdropTail.hotdrop`));
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 1350);
  }
});
