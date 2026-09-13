import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
// No .env loading, real credentials, or network requests in this harness.
function loadServer(file, env = {}, sdk = {}) {
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const { outputText } = ts.transpileModule(readFileSync(path.join(root, relative), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    });
    const exports = {};
    cache.set(relative, exports);
    new Function("exports", "require", "process", outputText)(exports, (id) => {
      // Next.js enforces this marker; the isolated unit runner has no React server condition.
      if (id === "server-only") return {};
      if (id === "@supabase/supabase-js") return sdk;
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      assert.equal(id, "node:crypto");
      return require(id);
    }, { env });
    return exports;
  }
  return load(`src/lib/server/${file}.ts`);
}

const { generateWriteToken, hashWriteToken, verifyWriteToken } = loadServer("writeToken");

test("tokens use 32 crypto random bytes and canonical base64url encoding", () => {
  const tokens = Array.from({ length: 100 }, () => generateWriteToken());
  assert.equal(new Set(tokens).size, tokens.length);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.equal(Buffer.from(token, "base64url").toString("base64url"), token);
  }
  // Shape/uniqueness alone do not prove entropy; also verify the CSPRNG source.
  const source = readFileSync(path.join(root, "src/lib/server/writeToken.ts"), "utf8");
  assert.match(source, /randomBytes\(32\)/);
  assert.doesNotMatch(source, /Math\.random/);
});

test("SHA-256 hashes UTF-8 token strings deterministically into lowercase hex", () => {
  const first = generateWriteToken();
  const second = generateWriteToken();
  const hash = hashWriteToken(first);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashWriteToken(first));
  assert.equal(hash, createHash("sha256").update(first, "utf8").digest("hex"));
  assert.notEqual(hash, hashWriteToken(second));
  assert.equal(verifyWriteToken(first, hash), true);
  assert.equal(verifyWriteToken(second, hash), false);
  assert.equal(verifyWriteToken(hash, hash), false);
});

test("invalid hashes and tokens safely fail verification", () => {
  const token = generateWriteToken();
  const hash = hashWriteToken(token);
  for (const invalid of [undefined, null, 123, {}, [], "", "a".repeat(63), "a".repeat(65),
    "g".repeat(64), "A".repeat(64), `${hash}\n`]) {
    assert.equal(verifyWriteToken(token, invalid), false);
  }
  for (const invalid of [undefined, null, 123, {}, [], "", "a".repeat(42), "a".repeat(44),
    "!".repeat(43), `${token}\n`, "B".repeat(43)]) {
    assert.equal(verifyWriteToken(invalid, hash), false);
  }
});

const fakeEnv = {
  SUPABASE_URL: "https://database.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "unit-test-secret-placeholder",
};

test("imports are lazy; missing/blank server env fails safely at client creation", () => {
  for (const env of [{}, { SUPABASE_URL: fakeEnv.SUPABASE_URL },
    { ...fakeEnv, SUPABASE_URL: " " }, { ...fakeEnv, SUPABASE_SERVICE_ROLE_KEY: " " },
    { NEXT_PUBLIC_SUPABASE_URL: fakeEnv.SUPABASE_URL, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: fakeEnv.SUPABASE_SERVICE_ROLE_KEY }]) {
    let calls = 0;
    const admin = loadServer("supabaseAdmin", env, { createClient() { calls += 1; } });
    assert.equal(calls, 0);
    assert.throws(() => admin.createSupabaseAdmin(), (error) => {
      assert.match(error.message, /^Missing server environment variable: SUPABASE_(URL|SERVICE_ROLE_KEY)$/);
      assert.ok(!error.stack.includes(fakeEnv.SUPABASE_SERVICE_ROLE_KEY));
      assert.ok(!error.stack.includes(fakeEnv.SUPABASE_URL));
      return true;
    });
    assert.equal(calls, 0);
  }
});

test("invalid URLs fail without exposing parser input or secrets", () => {
  for (const url of ["malformed-secret-input", "ftp://database.example.invalid", "http://database.example.invalid",
    "https://user:secret@database.example.invalid", "https://database.example.invalid/?token=hidden",
    "https://database.example.invalid/#hidden", "https://database.example.invalid/path"]) {
    const env = loadServer("supabaseEnv", { ...fakeEnv, SUPABASE_URL: url });
    assert.throws(() => env.getSupabaseEnv(), (error) => {
      assert.equal(error.message, "Invalid server environment variable: SUPABASE_URL");
      assert.ok(!error.stack.includes(url));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("admin SDK uses only server config with all session behavior disabled", () => {
  const calls = [];
  const client = {};
  const admin = loadServer("supabaseAdmin", fakeEnv, { createClient(...args) { calls.push(args); return client; } });
  assert.equal(calls.length, 0);
  assert.equal(admin.createSupabaseAdmin(), client);
  assert.deepEqual(calls, [[fakeEnv.SUPABASE_URL, fakeEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }]]);
  const local = loadServer("supabaseEnv", { ...fakeEnv, SUPABASE_URL: "http://127.0.0.1:54321" });
  assert.equal(local.getSupabaseEnv().url, "http://127.0.0.1:54321");
});

test("SDK initialization errors are sanitized, including their cause", () => {
  const admin = loadServer("supabaseAdmin", fakeEnv, { createClient() { throw new Error(fakeEnv.SUPABASE_SERVICE_ROLE_KEY); } });
  assert.throws(() => admin.createSupabaseAdmin(), (error) => {
    assert.equal(error.message, "Unable to initialize the server database client");
    assert.ok(!error.stack.includes(fakeEnv.SUPABASE_SERVICE_ROLE_KEY));
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("client import graphs cannot reach server modules; server entry points carry the boundary marker", () => {
  function filesIn(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(file) : /\.tsx?$/.test(file) ? [file] : [];
    });
  }
  const sources = new Map(filesIn(path.join(root, "src")).map((file) => [file, readFileSync(file, "utf8")]));
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const serverDir = path.join(root, "src/lib/server") + path.sep;
  for (const [file, source] of sources) {
    if (!file.startsWith(serverDir)) continue;
    assert.match(source, /import "server-only";/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_|console\.|trackEvent/);
  }
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(!file.startsWith(serverDir), "Client graph reached a server module");
    const source = sources.get(file);
    if (!source) return;
    for (const entry of ts.preProcessFile(source).importedFiles) {
      assert.notEqual(entry.fileName, "@supabase/supabase-js");
      const resolved = ts.resolveModuleName(entry.fileName, file, options, ts.sys).resolvedModule;
      if (resolved) {
        const resolvedFile = path.normalize(resolved.resolvedFileName);
        if (sources.has(resolvedFile)) visit(resolvedFile);
      }
    }
  }
  for (const [file, source] of sources) {
    if (/^["']use client["'];?/m.test(source) || file.endsWith("instrumentation-client.ts")) visit(file);
  }
  assert.ok(visited.size > 0);
  assert.ok(visited.has(path.join(root, "src/lib/visitorContext.ts")), "Follow indirect imports too");
});
