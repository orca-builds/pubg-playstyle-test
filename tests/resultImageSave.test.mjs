import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";

function result(h) {
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  return h.load("src/lib/scoring.ts").calculateScore(questions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id })));
}

test("16 export cards use real name/image/summary and up to two actual tags, without full result UI", () => {
  const h = createHarness();
  const Card = h.load("src/components/ResultImageCard.tsx").default;
  const base = result(h);
  for (const mainResult of Object.values(h.load("src/data/resultTypes.ts").resultTypes)) {
    const card = Card({ result: { ...base, mainResult } });
    const html = renderToStaticMarkup(card);
    assert.equal(card.props.style.width / card.props.style.height, 4 / 5);
    for (const text of [mainResult.name, mainResult.summary, mainResult.imageSrc, ...base.displaySubTags]) assert.ok(html.includes(text));
    assert.ok(html.includes(mainResult.description));
    const children = card.props.children;
    assert.equal(children[1].props.children, mainResult.name);
    assert.deepEqual(children[2].props.children.map(tag => tag.props.children), base.displaySubTags.slice(0, 2));
    assert.equal(children[3].props.src, mainResult.imageSrc);
    assert.equal(children[4].props.children, mainResult.summary);
    assert.equal(children[5].props.children, mainResult.description);
    const brand = children[6];
    assert.equal(brand.props.style.display, "flex");
    assert.equal(brand.props.style.alignItems, "center");
    assert.equal(brand.props.style.whiteSpace, "nowrap");
    assert.equal(brand.props.children[0].props.src, "/icon.png");
    assert.equal(brand.props.children[1].props.children, "PUBG 플레이스타일 테스트");
    assert.doesNotMatch(html, /<button|나의 플레이 성향|결과 공유하기|다시 하기/);
  }
  const single = renderToStaticMarkup(Card({ result: { ...base, displaySubTags: ["올라운더"] } }));
  assert.equal(single.split("올라운더").length - 1, 1);
});

function setup({ mobile = false, generate, share, active = true } = {}) {
  const states = [], refs = [], downloads = [];
  let stateIndex = 0, refIndex = 0, generations = 0;
  const png = new File(["png"], "result.png", { type: "image/png" });
  const h = createHarness({ navigator: { share: share ?? (async () => {}), userActivation: { isActive: active } }, mocks: {
    react: {
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
      useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; }, useEffect() {},
    },
    "@/lib/createResultImage": { async createResultImage() { generations++; return generate ? generate(png) : png; } },
    "@/lib/resultImageFile": { canShareResultImage: () => mobile, downloadResultImage: file => downloads.push(file) },
  } });
  const props = { result: result(h), attemptId: "image-attempt" };
  const Component = h.load("src/components/ResultImageSave.tsx").default;
  const render = () => { stateIndex = 0; refIndex = 0; return Component(props); };
  return { ...h, props, render, downloads, get generations() { return generations; } };
}

test("button is between share and restart; desktop save locks duplicates and only succeeds after delivery", async () => {
  let resolve;
  const h = setup({ generate: png => new Promise(done => { resolve = () => done(png); }) });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const Content = h.load("src/components/ResultContent.tsx").default;
  const actions = Content({ snapshot: { status: "ready", ...h.props }, onShare() {}, onStartTest() {}, onRetryLoad() {} }).props.children.at(-1).props.children;
  assert.equal(actions[2].type, h.load("src/components/ResultImageSave.tsx").default);
  assert.equal(actions[3].props.children, "다시 하기");
  const button = h.render().props.children[0];
  assert.equal(button.props.children, "결과 이미지 저장");
  assert.equal(h.render().props.children[1], false);
  const pending = button.props.onClick();
  await button.props.onClick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.generations, 1);
  assert.equal(h.render().props.children[0].props.disabled, true);
  assert.equal(h.render().props.children[0].props.children, "이미지 저장 중...");
  assert.equal(h.render().props.children[1], false);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click"]);
  resolve(); await pending;
  assert.equal(h.downloads.length, 1);
  assert.equal(h.render().props.children[0].props.disabled, false);
  assert.equal(h.render().props.children[1], false);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_success"]);
  for (const e of h.events) {
    assert.equal(e.properties.attempt_id, "image-attempt");
    assert.equal(e.properties.test_version, "v2");
    assert.equal(e.properties.main_type, h.props.result.mainResult.id);
    assert.ok(!JSON.stringify(e).includes("write_token"));
  }
});

test("generation failure releases lock and retries without affecting the result", async () => {
  let fail = true;
  const h = setup({ generate: png => { if (fail) throw new Error("private-detail"); return png; } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick();
  let ui = h.render();
  assert.equal(ui.props.children[0].props.disabled, false);
  assert.equal(ui.props.children[1].props.role, "alert");
  assert.equal(ui.props.children[1].props.children, "이미지 저장에 실패했어요. 다시 시도해주세요.");
  assert.ok(!ui.props.children[1].props.children.includes("private-detail"));
  fail = false;
  await ui.props.children[0].props.onClick();
  ui = h.render();
  assert.equal(ui.props.children[1], false);
  assert.equal(h.downloads.length, 1);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_error", "result_image_save_click", "result_image_save_success"]);
});

test("mobile prepares a PNG then shares files in a fresh click; cancel remains retryable without success", async () => {
  let cancel = true, shares = 0;
  const h = setup({ mobile: true, active: false, share: async payload => {
    shares++;
    assert.deepEqual(Object.keys(payload), ["files"]);
    assert.equal(payload.files[0].type, "image/png");
    if (cancel) throw new DOMException("cancel", "AbortError");
  } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick();
  assert.equal(shares, 0);
  assert.equal(h.render().props.children[0].props.children, "이미지 저장/공유");
  await h.render().props.children[0].props.onClick();
  assert.ok(!h.events.some(e => e.name.endsWith("success") || e.name.endsWith("error")));
  cancel = false;
  const pending = h.render().props.children[0].props.onClick();
  assert.equal(shares, 2); // navigator.share called synchronously in the click.
  await pending;
  assert.equal(h.generations, 1);
  assert.equal(h.downloads.length, 0);
  assert.equal(h.events.filter(e => e.name === "result_image_save_success").length, 1);
});

test("mobile shares immediately after generation when user activation is still valid", async () => {
  let shares = 0;
  const h = setup({ mobile: true, share: async payload => {
    shares++;
    assert.equal(payload.files[0].type, "image/png");
  } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick();
  assert.equal(shares, 1);
  assert.equal(h.downloads.length, 0);
  assert.equal(h.render().props.children[0].props.children, "결과 이미지 저장");
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_success"]);
});

test("file sharing detection and filenames handle iPhone, iPad, unsupported browsers and desktop", () => {
  for (const [userAgent, maxTouchPoints, support, expected] of [["iPhone", 1, true, true], ["Macintosh", 5, true, true], ["iPhone", 1, false, false], ["Desktop", 0, true, false]]) {
    const h = createHarness({ userAgent, maxTouchPoints, navigator: { share() {}, canShare: () => support } });
    const helper = h.load("src/lib/resultImageFile.ts");
    assert.equal(helper.canShareResultImage(new File(["png"], "test.png")), expected);
    assert.equal(helper.resultImageFilename('유형:/\\?*<>|"'), "pubg-playstyle-유형.png");
  }
});

test("PNG generation waits for image decode, exports 1080x1350 and cleans up on success/failure", async () => {
  for (const failure of ["none", "decode", "overflow", "blob"]) {
    let decoded = false, removed = false, unmounted = false, renders = 0;
    const card = { clientHeight: 675, scrollHeight: failure === "overflow" ? 676 : 675,
      clientWidth: 540, scrollWidth: 540,
      querySelectorAll: () => [0, 1].map(index => ({ async decode() { if (failure === "decode" && index === 1) throw new Error("brand image load"); decoded = true; } })) };
    const host = { style: {}, setAttribute() {}, firstElementChild: card, remove() { removed = true; } };
    const h = createHarness({ document: { createElement: () => host, body: { appendChild() {} }, fonts: { ready: Promise.resolve() } }, mocks: {
      "react-dom/client": { createRoot: () => ({ render() { renders++; }, unmount() { unmounted = true; } }) },
      "react-dom": { flushSync: fn => fn() },
      "html-to-image": { async toBlob(node, options) {
        assert.equal(node, card);
        assert.equal(decoded, true);
        assert.equal(options.width * options.pixelRatio, 1080);
        assert.equal(options.height * options.pixelRatio, 1350);
        return failure === "blob" ? null : new Blob(["png"], { type: "image/png" });
      } },
    } });
    const generate = h.load("src/lib/createResultImage.tsx").createResultImage;
    if (failure === "none") {
      const file = await generate(result(h));
      assert.equal(file.type, "image/png");
      assert.match(file.name, /^pubg-playstyle-.+\.png$/);
    } else await assert.rejects(generate(result(h)));
    assert.equal(renders, 1);
    assert.equal(removed, true);
    assert.equal(unmounted, true);
  }
});
