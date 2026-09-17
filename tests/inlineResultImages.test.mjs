import assert from "node:assert/strict";
import test from "node:test";
import { createHarness } from "./helpers/analyticsHarness.mjs";

function installReader(t, mode = "success") {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
  const readers = [];
  globalThis.FileReader = class {
    constructor() { readers.push(this); }
    readAsDataURL(blob) {
      assert.equal(blob.type, "image/png");
      if (mode === "stalled") return;
      if (mode === "error") { this.onerror(); return; }
      this.result = mode === "invalid" ? "data:text/html;base64,bad" : "data:image/png;base64,cG5n";
      this.onload();
    }
    abort() { this.aborted = true; this.onabort?.(); }
  };
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "FileReader", previous); else delete globalThis.FileReader;
  });
  return readers;
}

test("character and helmet become Data URLs on the actual capture DOM", async t => {
  const readers = installReader(t);
  const fetched = [];
  const h = createHarness({ fetch: async url => {
    fetched.push(url);
    return { ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) };
  } });
  const images = ["/images/results/01-test.png", "/icon.png"].map(src => ({
    src, srcset: "original", removeAttribute(name) { delete this[name]; },
  }));
  await h.load("src/lib/inlineResultImages.ts").inlineResultImages({ querySelectorAll: () => images });
  assert.deepEqual(fetched, ["/images/results/01-test.png", "/icon.png"]);
  assert.ok(images.every(image => image.src === "data:image/png;base64,cG5n" && !image.srcset));
  assert.ok(readers.every(reader => reader.onload === null && reader.onerror === null));
});

for (const mode of ["http", "network", "empty", "content", "error", "invalid", "stalled", "fetch-timeout"]) {
  test(`inline rejects ${mode} and releases readers/timers`, async t => {
    const readers = installReader(t, mode);
    let signal;
    const h = createHarness({ fetch: async (_, options) => {
      signal = options.signal;
      if (mode === "network") throw new Error("network");
      if (mode === "fetch-timeout") return new Promise(() => {});
      return { ok: mode !== "http", blob: async () => new Blob(mode === "empty" ? [] : ["png"], {
        type: mode === "content" ? "text/html" : "image/png",
      }) };
    } });
    await assert.rejects(h.load("src/lib/inlineResultImages.ts").imageUrlToDataURL("/icon.png", 5));
    if (["stalled", "fetch-timeout"].includes(mode)) assert.equal(signal.aborted, true);
    if (mode === "stalled") assert.equal(readers[0].aborted, true);
    assert.ok(readers.every(reader => reader.onload === null && reader.onerror === null));
  });
}

test("paint timeout cancels the pending animation frame", async t => {
  const keys = ["requestAnimationFrame", "cancelAnimationFrame"];
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  t.after(() => keys.forEach((key, i) => {
    if (originals[i]) Object.defineProperty(globalThis, key, originals[i]); else delete globalThis[key];
  }));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.requestAnimationFrame = () => 42;
  let cancelled;
  globalThis.cancelAnimationFrame = id => { cancelled = id; };
  const pending = createHarness().load("src/lib/inlineResultImages.ts").waitForResultImagePaint();
  t.mock.timers.tick(10_000);
  await assert.rejects(pending, /IMAGE_PAINT_TIMEOUT/);
  assert.equal(cancelled, 42);
});
