import { imageText } from "./helpers/resultImageText.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createHarness } from "./helpers/analyticsHarness.mjs";

function fakeImage(complete = false, width = 280, height = 280) {
  const image = new EventTarget();
  Object.assign(image, { complete, naturalWidth: complete ? width : 0, naturalHeight: complete ? height : 0 });
  image.load = () => {
    Object.assign(image, { complete: true, naturalWidth: width, naturalHeight: height });
    image.dispatchEvent(new Event("load"));
  };
  return image;
}

for (const userAgent of ["Android", "Desktop"]) {
  test(`${userAgent} uses download without accessing Web Share`, async () => {
    const h = setup({ userAgent });
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    await h.render().props.children[0].props.onClick();
    assert.equal(h.downloads.length, 1);
    assert.equal(h.render().props.children[0].props.children, "이미지 저장");
    assert.equal(h.render().props.children[1], false);
    assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_success"]);
  });
}

test("download errors including AbortError show failure and allow retry", async () => {
  let fail = true;
  const h = setup({ download() { if (fail) throw new DOMException("failed", "AbortError"); } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick();
  assert.equal(h.render().props.children[0].props.disabled, false);
  assert.equal(h.render().props.children[1].props.role, "alert");
  fail = false;
  await h.render().props.children[0].props.onClick();
  assert.equal(h.render().props.children[1], false);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_error", "result_image_save_click", "result_image_save_success"]);
});

test("download creates an anchor, cleans up, revokes later, and sanitizes filenames", t => {
  const blob = new Blob(["png"], { type: "image/png" });
  let clicked = 0, removed = 0, appended = 0, revoked = 0;
  const link = { click() { clicked++; }, remove() { removed++; } };
  t.mock.method(URL, "createObjectURL", input => { assert.equal(input, blob); return "blob:test"; });
  t.mock.method(URL, "revokeObjectURL", url => { assert.equal(url, "blob:test"); revoked++; });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = createHarness({ document: { createElement: () => link, body: { appendChild() { appended++; } } } });
  const { downloadResultImage, resultImageFilename } = h.load("src/lib/resultImageFile.ts");
  const filename = resultImageFilename('유형:/\\?*<>|"');
  assert.equal(filename, "pubg-playstyle-유형.png");
  assert.equal(resultImageFilename("... "), "pubg-playstyle-result.png");
  downloadResultImage(blob, filename);
  assert.equal(link.href, "blob:test");
  assert.equal(link.download, filename);
  assert.deepEqual([clicked, removed, appended, revoked], [1, 1, 1, 0]);
  t.mock.timers.tick(60_000);
  assert.equal(revoked, 1);
  link.click = () => { throw new Error("download failed"); };
  assert.throws(() => downloadResultImage(blob, filename), /download failed/);
  assert.equal(removed, 2);
  t.mock.timers.tick(60_000);
  assert.equal(revoked, 2);
});

function result(h) {
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  return h.load("src/lib/scoring.ts").calculateScore(questions.map(q => ({ questionId: q.id, choiceId: q.choices[0].id })));
}

test("16 export cards use real name/image/summary and up to two actual tags, without full result UI", () => {
  const h = createHarness();
  const Card = h.load("src/components/ResultImageCard.tsx").default;
  const base = result(h);
  for (const mainResult of Object.values(h.load("src/data/resultTypes.ts").resultTypes)) {
    const card = Card({ result: { ...base, mainResult }, textLines: imageText(mainResult) });
    const html = renderToStaticMarkup(card);
    assert.equal(card.props.style.width / card.props.style.height, 4 / 5);
    for (const text of [mainResult.name, mainResult.imageSrc, ...base.displaySubTags]) assert.ok(html.includes(text));

    const children = card.props.children;
    assert.equal(children[1].props.children, mainResult.name);
    assert.deepEqual(children[2].props.children.map(tag => tag.props.children), base.displaySubTags.slice(0, 2));
    assert.equal(children[3].props.src, mainResult.imageSrc);
    assert.equal(children[4].props.children.replace(/\s+/g, " "), mainResult.summary);
    assert.equal(children[5].props.children.replace(/\s+/g, " "), mainResult.description.replace(/\s+/g, " "));
    const brand = children[6];
    assert.equal(brand.props.style.display, "flex");
    assert.equal(brand.props.style.alignItems, "center");
    assert.equal(brand.props.style.whiteSpace, "nowrap");
    assert.equal(brand.props.children[0].props.src, "/icon.png");
    assert.equal(brand.props.children[1].props.children, "PUBG 플레이스타일 테스트");
    assert.doesNotMatch(html, /<button|나의 플레이 성향|결과 공유하기|다시 하기/);
  }
  const single = renderToStaticMarkup(Card({ textLines: imageText(base.mainResult), result: { ...base, displaySubTags: ["올라운더"] } }));
  assert.equal(single.split("올라운더").length - 1, 1);
});

function setup({ userAgent = "Desktop", generate, download, directDownload, handoff, viewError = false } = {}) {
  const states = [], refs = [], downloads = [], effects = [];
  let key;
  const unmount = () => { effects.splice(0).forEach(effect => effect.cleanup?.()); };
  let stateIndex = 0, refIndex = 0, effectIndex = 0, generations = 0;
  const image = fakeImage(false, 1080, 1350);
  const view = { open: false, showModal() { if (viewError) throw new Error("view failed"); this.open = true; }, close() { this.open = false; } };
  const png = new File(["png"], "result.png", { type: "image/png" });
  const imageWindow = { closed: false, close() { this.closed = true; }, location: { replace(url) { if (handoff) handoff(url); imageWindow.url = url; } } };
  const h = createHarness({ userAgent, navigator: { share() { assert.fail("Unexpected image share"); }, canShare() { assert.fail("Unexpected canShare"); } }, mocks: {
    react: {
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
      useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
      useEffect(effect, deps) {
        const i = effectIndex++;
        if (!effects[i] || deps.some((value, index) => value !== effects[i].deps[index])) {
          effects[i]?.cleanup?.();
          effects[i] = { deps, pending: effect };
        }
      },
    },
    "@/lib/createResultImage": { async createResultImage() { generations++; return generate ? generate(png) : png; } },
    "@/lib/resultImageFile": {
      ...createHarness({ userAgent }).load("src/lib/resultImageFile.ts"),
      downloadResultImage: file => { if (download) download(); downloads.push(file); },
      openResultImageWindow() {
        if (!directDownload) return null;
        directDownload();
        return imageWindow;
      },
    },
  } });
  const props = { result: result(h), attemptId: "image-attempt" };
  const Component = h.load("src/components/ResultImageSave.tsx").default;
  const render = () => {
    const child = Component(props);
    if (child.key !== key) {
      unmount(); states.length = 0; refs.length = 0; key = child.key;
    }
    stateIndex = 0; refIndex = 0; effectIndex = 0;
    const tree = child.type(child.props);
    const modal = tree.props.children[2];
    if (modal) {
      modal.props.ref.current = view;
      modal.props.children[1].props.ref.current = image;
    }
    for (const effect of effects) {
      if (effect.pending) { effect.cleanup = effect.pending(); delete effect.pending; }
    }
    return tree;
  };
  return { ...h, props, render, unmount, downloads, image, view, imageWindow, get generations() { return generations; } };
}

test("iOS handoff exception automatically opens PNG modal; success means availability, not Photos save", async t => {
  t.mock.method(URL, "createObjectURL", () => "blob:preview");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  const h = setup({ userAgent: "iPhone" });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const pending = h.render().props.children[0].props.onClick();
  assert.equal(h.render().props.children[0].props.children, "이미지 만드는 중...");
  await pending;
  const tree = h.render(), modal = tree.props.children[2];
  assert.equal(tree.props.children[0].props.children, "이미지 저장");
  assert.equal(modal.type, "dialog");
  assert.equal(h.view.open, true);
  assert.equal(modal.props.children[0].props.children[0].props.children, "이미지를 길게 눌러 저장하세요.");
  const img = modal.props.children[1];
  assert.equal(img.type, "img");
  assert.equal(img.props.src, "blob:preview");
  assert.equal(img.props.width, 1080);
  assert.equal(img.props.height, 1350);
  assert.equal(img.props.style.WebkitTouchCallout, "default");
  assert.equal(h.downloads.length, 0);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click"]);
  h.image.load(); h.image.load();
  await tree.props.children[0].props.onClick();
  assert.equal(h.generations, 1);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_success"]);
  assert.equal(h.events.at(-1).properties.save_method, "preview_fallback");
  modal.props.children[0].props.children[1].props.onClick();
  assert.equal(h.render().props.children[2], null);
  assert.equal(h.view.open, false);
  assert.equal(revoke.mock.callCount(), 1);
  h.unmount();
  assert.equal(revoke.mock.callCount(), 1);
});

test("iOS reserves a window on first tap and hands off one validated PNG without double success", async t => {
  t.mock.method(URL, "createObjectURL", () => "blob:preview");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  let attempts = 0, resolve;
  const h = setup({ userAgent: "iPhone", directDownload() { attempts++; },
    generate: png => new Promise(done => { resolve = () => done(png); }),
  });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const button = h.render().props.children[0];
  const pending = button.props.onClick();
  assert.equal(attempts, 1); // Synchronous before the server request resolves.
  await button.props.onClick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(attempts, 1);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click"]);
  assert.equal(h.imageWindow.url, undefined);
  resolve(); await pending;
  const tree = h.render();
  assert.equal(tree.props.children[2], null);
  assert.equal(tree.props.children[3].props.children, "저장되지 않았나요? 이미지 보기");
  assert.equal(h.downloads.length, 0); // No iOS Blob download.
  assert.equal(h.events.at(-1).properties.save_method, "download");
  assert.equal(h.imageWindow.url, "blob:preview");
  assert.equal(tree.props.children[1], false);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_success"]);
  tree.props.children[3].props.onClick(); h.render(); h.image.load();
  assert.equal(h.view.open, true);
  assert.equal(h.generations, 1);
  assert.equal(h.events.filter(e => e.name === "result_image_save_success").length, 1);
  h.unmount();
  assert.equal(revoke.mock.callCount(), 1);
});

test("manual preview failure cannot turn a successful iOS handoff into a save error", async t => {
  t.mock.method(URL, "createObjectURL", () => "blob:preview");
  t.mock.method(URL, "revokeObjectURL", () => {});
  const h = setup({ userAgent: "iPhone", directDownload() {} });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick();
  h.render().props.children[3].props.onClick(); h.render();
  h.image.dispatchEvent(new Event("error"));
  const tree = h.render();
  assert.equal(tree.props.children[2], null);
  assert.equal(tree.props.children[1], false);
  assert.equal(tree.props.children[0].props.disabled, false);
  assert.deepEqual(h.events.filter(e => e.name !== "result_image_save_click").map(e => [e.name, e.properties.save_method]), [
    ["result_image_save_success", "download"],
  ]);
  await tree.props.children[0].props.onClick();
  assert.equal(h.generations, 2);
  assert.equal(h.render().props.children[1], false);
  h.unmount();
});

test("iOS reserves a blank window with no opener and detects blocked popups", () => {
  const h = createHarness();
  const view = { opener: h.window };
  h.window.open = (url, target) => {
    assert.equal(url, "about:blank");
    assert.equal(target, "_blank");
    return view;
  };
  const { openResultImageWindow } = h.load("src/lib/resultImageFile.ts");
  assert.equal(openResultImageWindow(), view);
  assert.equal(view.opener, null);
  h.window.open = () => null;
  assert.equal(openResultImageWindow(), null);
});

test("iOS request failure closes the reserved window and records only error", async () => {
  const h = setup({ userAgent: "iPhone", directDownload() {}, generate() { throw new Error("IMAGE_REQUEST_FAILED"); } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick();
  assert.equal(h.imageWindow.closed, true);
  assert.equal(h.imageWindow.url, undefined);
  assert.equal(h.render().props.children[1].props.role, "alert");
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_error"]);
  assert.equal(h.events.at(-1).properties.save_method, "download");
});

test("iOS navigation failure falls back to the same PNG preview", async t => {
  t.mock.method(URL, "createObjectURL", () => "blob:preview");
  t.mock.method(URL, "revokeObjectURL", () => {});
  const h = setup({ userAgent: "iPhone", directDownload() {}, handoff() { throw new Error("blocked"); } });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  await h.render().props.children[0].props.onClick(); h.render(); h.image.load();
  assert.equal(h.imageWindow.closed, true);
  assert.equal(h.generations, 1);
  assert.equal(h.render().props.children[1], false);
  assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_success"]);
  assert.equal(h.events.at(-1).properties.save_method, "preview_fallback");
  h.unmount();
});

test("iOS generation/preload errors and URL failure never open a view and allow retry", async t => {
  t.mock.method(URL, "revokeObjectURL", () => {});
  for (const stage of ["generation", "preload", "timeout", "url"]) {
    let fail = true;
    t.mock.method(URL, "createObjectURL", () => { if (fail && stage === "url") throw new Error("url failed"); return "blob:preview"; });
    const h = setup({ userAgent: "iPhone", generate: png => { if (fail && stage !== "url") throw new Error(stage); return png; } });
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    await h.render().props.children[0].props.onClick();
    const tree = h.render();
    assert.equal(tree.props.children[1].props.children, "이미지 저장에 실패했어요. 다시 시도해주세요.");
    assert.equal(tree.props.children[2], null);
    assert.equal(h.view.open, false);
    fail = false;
    await tree.props.children[0].props.onClick(); h.render(); h.image.load();
    assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_error", "result_image_save_click", "result_image_save_success"]);
    h.unmount();
  }
});

test("iOS modal open/load/timeout failures report error, release URL and never report success", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(URL, "createObjectURL", () => "blob:preview");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  for (const failure of ["open", "load", "timeout"]) {
    const before = revoke.mock.callCount();
    const h = setup({ userAgent: "iPhone", viewError: failure === "open" });
    await h.load("src/lib/analytics.ts").initializeAnalytics();
    await h.render().props.children[0].props.onClick(); h.render();
    if (failure === "load") h.image.dispatchEvent(new Event("error"));
    if (failure === "timeout") t.mock.timers.tick(10_000);
    const tree = h.render();
    assert.equal(tree.props.children[2], null);
    assert.equal(tree.props.children[1].props.role, "alert");
    assert.deepEqual(h.events.map(e => e.name), ["result_image_save_click", "result_image_save_error"]);
    assert.equal(revoke.mock.callCount(), before + 1);
    h.unmount();
  }
});

test("iOS unused URLs are revoked on unmount or result/attempt change", async t => {
  t.mock.method(URL, "createObjectURL", () => "blob:prepared");
  const revoked = [];
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  for (const change of ["unmount", "attempt", "result"]) {
    const h = setup({ userAgent: "iPhone" });
    await h.render().props.children[0].props.onClick();
    const before = revoked.length;
    if (change === "unmount") h.unmount();
    else {
      if (change === "attempt") h.props.attemptId = "next-attempt";
      else h.props.result = { ...h.props.result, mainResult: { ...h.props.result.mainResult, id: "new-type" } };
      assert.equal(h.render().props.children[0].props.children, "이미지 저장");
    }
    assert.equal(revoked.length, before + 1);
  }
});

test("pending generation cannot prepare or download after unmount or attempt change", async t => {
  t.mock.method(URL, "createObjectURL", () => assert.fail("Stale generation must not create a URL"));
  for (const change of ["unmount", "attempt"]) {
    let resolve;
    const h = setup({ userAgent: "iPhone", generate: png => new Promise(done => { resolve = () => done(png); }) });
    const pending = h.render().props.children[0].props.onClick();
    await Promise.resolve(); await Promise.resolve();
    if (change === "unmount") h.unmount();
    else { h.props.attemptId = "next"; h.render(); }
    resolve(); await pending;
    assert.equal(h.downloads.length, 0);
    assert.ok(!h.events.some(e => e.name === "result_image_save_success"));
  }
});

test("iOS detection covers iPhone browsers and desktop-mode iPadOS without matching Mac/Android", () => {
  for (const [userAgent, maxTouchPoints, expected] of [
    ["iPhone Safari", 1, true], ["iPhone CriOS", 1, true], ["iPad", 5, true],
    ["iPod", 1, true], ["Macintosh", 5, true], ["Macintosh", 0, false], ["Android Mobile", 5, false],
  ]) {
    assert.equal(createHarness({ userAgent, maxTouchPoints }).load("src/lib/resultImageFile.ts").isIOSBrowser(), expected);
  }
});

test("button is between share and restart; desktop save locks duplicates and only succeeds after delivery", async () => {
  let resolve;
  const h = setup({ generate: png => new Promise(done => { resolve = () => done(png); }) });
  await h.load("src/lib/analytics.ts").initializeAnalytics();
  const Content = h.load("src/components/ResultContent.tsx").default;
  const actions = Content({ snapshot: { status: "ready", ...h.props }, onShare() {}, onStartTest() {}, onRetryLoad() {} }).props.children.at(-1).props.children;
  assert.equal(actions[2].type, h.load("src/components/ResultImageSave.tsx").default);
  assert.equal(actions[3].props.children, "다시 하기");
  const button = h.render().props.children[0];
  assert.equal(button.props.children, "이미지 저장");
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
