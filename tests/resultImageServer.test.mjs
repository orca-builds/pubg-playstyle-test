import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const mainType = "combat-frontline-pressure-risk";
const query = `main_type=${mainType}&tag=mainBodyFlank.mainBody&tag=hotdropTail.hotdrop`;

test("all 16 server cards look up canonical text and embed local character and helmet", async () => {
  const cards = [];
  const h = createHarness({ mocks: { "next/og": { ImageResponse: class {
    constructor(card, options) { cards.push(card); assert.equal(options.width, 1080); assert.equal(options.height, 1350); }
    async arrayBuffer() { return new ArrayBuffer(24); }
  } } } });
  const { GET } = h.load("src/app/api/result-image/route.ts");
  for (const mainResult of Object.values(h.load("src/data/resultTypes.ts").resultTypes)) {
    const response = await GET(new Request(`https://example.invalid/api/result-image?${query.replace(mainType, mainResult.id)}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    const children = cards.at(-1).props.children;
    assert.equal(children[1].props.children, mainResult.name);
    assert.deepEqual(children[2].props.children.map(tag => tag.props.children), ["본대형", "대꼴형"]);
    assert.match(children[3].props.src, /^data:image\/png;base64,/);
    assert.equal(children[4].props.children.replace(/\s+/g, " "), mainResult.summary);
    assert.equal(children[5].props.children.replace(/\s+/g, " "), mainResult.description.replace(/\s+/g, " "));
    assert.match(children[6].props.children[0].props.src, /^data:image\/png;base64,/);
    assert.equal(children[6].props.children[1].props.children, "PUBG 플레이스타일 테스트");
  }
});

test("invalid main types/tags and extra private parameters return 400", async () => {
  const h = createHarness();
  const { GET } = h.load("src/app/api/result-image/route.ts");
  for (const value of ["", query.replace(mainType, "__proto__"), query.replace("mainBodyFlank.mainBody", "private"),
    `${query}&attempt_id=private`, `${query}&tag=allRounder`, `${query}&main_type=${mainType}`]) {
    assert.equal((await GET(new Request(`https://example.invalid/api/result-image?${value}`))).status, 400);
  }
});

test("asset read and asynchronous renderer failures return sanitized 500", async () => {
  for (const mocks of [
    { "node:fs/promises": { readFile: async () => { throw new Error("private-path"); } } },
    { "next/og": { ImageResponse: class { async arrayBuffer() { throw new Error("private-render"); } } } },
  ]) {
    const response = await createHarness({ mocks }).load("src/app/api/result-image/route.ts").GET(new Request(`https://example.invalid/api/result-image?${query}`));
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Image generation failed");
  }
});

test("client sends only public keys and validates server PNG before handing off", async () => {
  const bytes = new Uint8Array(24);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x89504e47); header.setUint32(4, 0x0d0a1a0a);
  header.setUint32(16, 1080); header.setUint32(20, 1350);
  for (const failure of ["none", "status", "type", "body", "network"]) {
    let url;
    const h = createHarness({ fetch: async path => {
      url = path;
      if (failure === "network") throw new Error("offline");
      return new Response(failure === "body" ? "broken" : bytes, {
        status: failure === "status" ? 500 : 200,
        headers: { "content-type": failure === "type" ? "text/html" : "image/png" },
      });
    } });
    const result = { mainResult: h.load("src/data/resultTypes.ts").resultTypes[mainType], displaySubTags: ["본대형", "대꼴형"], attempt_id: "private" };
    const promise = h.load("src/lib/createResultImage.ts").createResultImage(result);
    if (failure === "none") assert.equal((await promise).type, "image/png");
    else await assert.rejects(promise);
    assert.equal(url, `/api/result-image?${query}`);
  }
});

test("single all-rounder and invalid display tags are handled without exposing labels", () => {
  const h = createHarness();
  const { resultImageRequestUrl, parseResultImageRequest } = h.load("src/lib/resultImageRequest.ts");
  const mainResult = h.load("src/data/resultTypes.ts").resultTypes[mainType];
  const url = resultImageRequestUrl({ mainResult, displaySubTags: ["올라운더"] });
  assert.equal(url, `/api/result-image?main_type=${mainType}&tag=allRounder`);
  assert.deepEqual(parseResultImageRequest(new URL(url, "https://example.invalid").searchParams).displaySubTags, ["올라운더"]);
  assert.throws(() => resultImageRequestUrl({ mainResult, displaySubTags: ["private"] }));
});
