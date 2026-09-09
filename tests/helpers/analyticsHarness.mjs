import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
export const configured = {
  NEXT_PUBLIC_POSTHOG_KEY: "unit-test-placeholder",
  NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example.invalid",
};

export function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

export function createHarness(options = {}) {
  const window = options.ssr ? undefined : {
    localStorage: options.localStorage ?? memoryStorage(),
    sessionStorage: options.sessionStorage ?? memoryStorage(),
    location: { href: options.href ?? "https://example.invalid/" },
  };
  const events = [];
  const initCalls = [];
  let imports = 0;
  const sdk = {
    init(...args) {
      initCalls.push(args);
      if (options.initError) throw new Error("simulated init failure");
      return sdk;
    },
    capture(name, properties) {
      if (options.captureError) throw new Error("simulated capture failure");
      events.push({ name, properties });
    },
  };
  const modules = new Map();
  function load(relativePath) {
    if (modules.has(relativePath)) return modules.get(relativePath);
    const { outputText } = ts.transpileModule(readFileSync(new URL(relativePath, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX },
    });
    const exports = {};
    modules.set(relativePath, exports);
    new Function("exports", "require", "process", "window", "document", "navigator", "crypto", outputText)(
      exports,
      (id) => {
        if (options.mocks?.[id]) return options.mocks[id];
        if (id === "posthog-js") {
          imports += 1;
          if (options.loadError) throw new Error("simulated load failure");
          return { default: sdk };
        }
        if (!id.startsWith("@/")) return require(id);
        const file = `src/${id.slice(2)}`;
        return load(existsSync(new URL(`${file}.ts`, root)) ? `${file}.ts` : `${file}.tsx`);
      },
      { env: options.env ?? configured }, window,
      { referrer: options.referrer ?? "" },
      { userAgent: options.userAgent ?? "Desktop", maxTouchPoints: options.maxTouchPoints ?? 0 },
      { randomUUID },
    );
    return exports;
  }
  return { load, window, events, initCalls, get imports() { return imports; } };
}
