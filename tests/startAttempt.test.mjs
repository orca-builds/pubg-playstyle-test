import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
function harness(mode = "ok", fetch = null) {
  const inserts = [];
  const logs = [];
  const cache = new Map();
  const privateError = "unit-test-service-secret-and-private-db-detail";
  let token;
  let clientCalls = 0;
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    });
    const exports = {};
    cache.set(file, exports);
    new Function("exports", "require", "console", "process", outputText)(exports, (id) => {
      if (id === "server-only") return {};
      if (id === "node:crypto") return require(id);
      if (id === "@supabase/supabase-js") return { createClient(url, key, options) {
        return createClient(url, key, { ...options, global: { fetch } });
      } };
      if (id === "@/lib/server/supabaseAdmin" && fetch) return load("src/lib/server/supabaseAdmin.ts");
      if (id === "@/lib/server/supabaseAdmin") return { createSupabaseAdmin() {
        clientCalls += 1;
        if (mode === "init-error") throw new Error(privateError);
        return { from(table) {
          assert.equal(table, "test_attempts");
          return { insert(payload) {
            inserts.push(payload);
            return { abortSignal(signal) {
              assert.ok(signal instanceof AbortSignal);
              return { async retry(enabled) {
                assert.equal(enabled, false);
                if (mode === "throw") throw new Error(`${privateError} ${token}`);
                return mode === "db-error" ? { error: { message: `${privateError} ${token}`, details: payload } } : { error: null };
              } };
            } };
          } };
        } };
      } };
      assert.ok(id.startsWith("@/"));
      const loadedModule = load(`src/${id.slice(2)}.ts`);
      if (id === "@/lib/server/writeToken") return { ...loadedModule, generateWriteToken() {
        token = loadedModule.generateWriteToken();
        return token;
      } };
      return loadedModule;
    }, new Proxy({}, { get: () => (...args) => logs.push(args) }), { env: {
      SUPABASE_URL: "https://database.example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: privateError,
    } });
    return exports;
  }
  const route = load("src/app/api/attempts/start/route.ts");
  const { questionSet } = load("src/data/questions.ts");
  const { QUESTION_ORDER_KEY } = load("src/data/questionOrder.ts");
  const body = {
    anonymous_id: "00000000-0000-4000-8000-000000000001",
    session_id: "00000000-0000-4000-8000-000000000002",
    test_version: questionSet.version,
    initial_source: "direct", initial_medium: "none", initial_campaign: "",
    initial_referrer: "", landing_page: "/", is_retry: false,
    question_order_key: QUESTION_ORDER_KEY,
  };
  function post(input = body) {
    return route.POST(new Request("https://test.example.invalid/api/attempts/start", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }));
  }
  return { route, body, post, inserts, logs, privateError, get clientCalls() { return clientCalls; } };
}

test("start returns only server UUID and token after a single allowlisted insert", async () => {
  const h = harness();
  const before = Date.now();
  const response = await h.post();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), ["attempt_id", "write_token"]);
  assert.match(result.attempt_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(result.write_token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(h.inserts.length, 1);
  const payload = h.inserts[0];
  assert.deepEqual(payload, {
    ...h.body, id: result.attempt_id,
    write_token_hash: createHash("sha256").update(result.write_token).digest("hex"),
    started_at: payload.started_at, is_completed: false, last_question_index: 0,
  });
  assert.ok(Date.parse(payload.started_at) >= before && Date.parse(payload.started_at) <= Date.now());
  assert.ok(!JSON.stringify(payload).includes(result.write_token));
  assert.deepEqual(h.logs, []);
});

test("each start creates a distinct attempt/token and preserves valid attribution", async () => {
  const h = harness();
  const input = { ...h.body, initial_source: "newsletter", initial_medium: "email",
    initial_campaign: "fall_2026", initial_referrer: "https://example.invalid", landing_page: "/test", is_retry: true };
  const first = await (await h.post(input)).json();
  const second = await (await h.post(input)).json();
  assert.notEqual(first.attempt_id, second.attempt_id);
  assert.notEqual(first.write_token, second.write_token);
  for (const [key, value] of Object.entries(input)) assert.equal(h.inserts[0][key], value);
});

test("retry inserts a fresh incomplete row without touching the completed row or its answers", async () => {
  const h = harness();
  const old = await (await h.post()).json();
  Object.assign(h.inserts[0], { is_completed: true, last_question_index: 24,
    main_type: "preserved-result", completed_at: new Date().toISOString() });
  const previous = structuredClone(h.inserts[0]);
  // The route's DB mock exposes only insert on test_attempts; any answers write or
  // update/delete would fail. This verifies the request contract, not a live DB.
  const response = await h.post({ ...h.body, is_retry: true });
  assert.equal(response.status, 201);
  const next = await response.json();
  assert.notEqual(next.attempt_id, old.attempt_id);
  assert.notEqual(next.write_token, old.write_token);
  assert.deepEqual(h.inserts[0], previous);
  assert.equal(h.inserts.length, 2);
  assert.equal(h.inserts[1].anonymous_id, previous.anonymous_id);
  assert.equal(h.inserts[1].is_retry, true);
  assert.equal(h.inserts[1].is_completed, false);
  assert.equal(h.inserts[1].last_question_index, 0);
});

test("every required field, UUID, version/order, and boolean is validated before DB access", async () => {
  const h = harness();
  const invalid = [null, [], "body", {}, ...Object.keys(h.body).map((key) => {
    const copy = { ...h.body }; delete copy[key]; return copy;
  })];
  for (const [key, value] of [["anonymous_id", "bad"], ["session_id", "bad"], ["test_version", ""],
    ["test_version", "unsupported"], ["question_order_key", "q01,q02"], ["is_retry", "false"], ["initial_source", 1]]) {
    invalid.push({ ...h.body, [key]: value });
  }
  for (const body of invalid) {
    const response = await h.post(body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INVALID_REQUEST" });
  }
  assert.equal(h.clientCalls, 0);
});

test("attribution rejects arbitrary text, full referrer URLs, and query/hash in landing paths", async () => {
  const h = harness();
  for (const [key, value] of [["initial_source", ""], ["initial_medium", "hello world"],
    ["initial_campaign", "person@example.invalid"], ["initial_campaign", "a".repeat(121)],
    ["initial_referrer", "https://example.invalid/path?private=yes"],
    ["initial_referrer", "https://user:secret@example.invalid"],
    ["landing_page", "/?token=private"], ["landing_page", "/#private"],
    ["landing_page", "https://example.invalid/"], ["landing_page", "/" + "x".repeat(2048)]]) {
    assert.equal((await h.post({ ...h.body, [key]: value })).status, 400);
  }
  assert.equal(h.clientCalls, 0);
});

test("all fields reject wrong JSON types before DB access", async () => {
  const h = harness();
  for (const key of Object.keys(h.body)) {
    const invalid = key === "is_retry" ? [null, 0, 1, "true", {}, []] : [null, true, 1, {}, []];
    for (const value of invalid) {
      assert.equal((await h.post({ ...h.body, [key]: value })).status, 400, key);
    }
  }
  assert.equal(h.clientCalls, 0);
});

test("marketing slugs reject trailing line endings and overlong values", async () => {
  const h = harness();
  for (const key of ["initial_source", "initial_medium", "initial_campaign"]) {
    for (const value of ["direct\n", "direct\r", "direct\r\n", "direct\u2028", "direct\u2029", "a".repeat(121)]) {
      assert.equal((await h.post({ ...h.body, [key]: value })).status, 400, key);
    }
  }
  assert.equal(h.clientCalls, 0);
});

test("UUIDs reject whitespace, wrong versions and variants; attribution enforces URL boundaries", async () => {
  const h = harness();
  for (const key of ["anonymous_id", "session_id"]) {
    for (const value of [h.body[key] + "\n", " " + h.body[key], "00000000-0000-1000-8000-000000000001",
      "00000000-0000-4000-0000-000000000001", "00000000000040008000000000000001"]) {
      assert.equal((await h.post({ ...h.body, [key]: value })).status, 400, key);
    }
  }
  for (const [key, value] of [["initial_referrer", "x".repeat(2049)], ["initial_referrer", "https://example.invalid/"],
    ["landing_page", ""], ["landing_page", "/a/../b"], ["landing_page", "/a\\b"], ["landing_page", "/a b"]]) {
    assert.equal((await h.post({ ...h.body, [key]: value })).status, 400, key);
  }
  assert.equal(h.clientCalls, 0);
});

test("valid slug/path limits, uppercase UUIDs and opaque referrer are preserved", async () => {
  const h = harness();
  const input = { ...h.body, anonymous_id: "ABCDEFAB-ABCD-4ABC-8ABC-ABCDEFABCDEF",
    initial_source: "a".repeat(120), initial_medium: "AZ09._~-", initial_campaign: "b".repeat(120),
    initial_referrer: "null", landing_page: "/" + "a".repeat(2047) };
  assert.equal((await h.post(input)).status, 201);
  for (const [key, value] of Object.entries(input)) assert.equal(h.inserts[0][key], value);
});

test("untrusted ID, hash, timestamps and completion fields cannot enter the insert", async () => {
  const h = harness();
  for (const field of ["id", "attempt_id", "write_token", "write_token_hash", "started_at", "created_at", "updated_at", "is_completed", "last_question_index"]) {
    assert.equal((await h.post({ ...h.body, [field]: "injected" })).status, 400);
  }
  assert.equal(h.inserts.length, 0);
});

test("malformed JSON and unsupported content type return safe 4xx JSON", async () => {
  const h = harness();
  for (const [contentType, body, status] of [["application/json", "{private", 400], ["text/plain", "private", 415]]) {
    const response = await h.route.POST(new Request("https://test.example.invalid/api/attempts/start", {
      method: "POST", headers: { "content-type": contentType }, body,
    }));
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes("private"));
  }
  assert.equal(h.clientCalls, 0);
});

test("DB/init/thrown errors produce a fixed 500 without token, hash, secret, stack or logs", async () => {
  for (const mode of ["db-error", "throw", "init-error"]) {
    const h = harness(mode);
    const response = await h.post();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "ATTEMPT_START_FAILED" });
    assert.deepEqual(h.logs, []);
    assert.equal(h.clientCalls, 1);
    assert.ok(h.inserts.length <= 1);
  }
});

test("real SDK sends one POST with only the insert payload and handles failures without retry", async () => {
  for (const mode of ["ok", "db-error", "throw", "timeout"]) {
    const requests = [];
    const h = harness(mode, async (url, options) => {
      requests.push({ url: String(url), options });
      if (mode === "throw") throw new Error("private-network-error");
      if (mode === "timeout") throw new DOMException("private-timeout-error", "TimeoutError");
      if (mode === "db-error") return Response.json({ message: "private-db-error", details: options.body }, { status: 503 });
      return new Response(null, { status: 201 });
    });
    const response = await h.post();
    const result = await response.json();
    assert.equal(requests.length, 1);
    const { url, options } = requests[0];
    assert.equal(url, "https://database.example.invalid/rest/v1/test_attempts");
    assert.equal(options.method, "POST");
    assert.ok(options.signal instanceof AbortSignal);
    assert.ok(!new Headers(options.headers).get("prefer")?.includes("return=representation"));
    const payload = JSON.parse(options.body);
    assert.deepEqual(Object.keys(payload).sort(), [...Object.keys(h.body), "id", "write_token_hash",
      "started_at", "is_completed", "last_question_index"].sort());
    if (mode === "ok") {
      assert.equal(response.status, 201);
      assert.deepEqual(Object.keys(result).sort(), ["attempt_id", "write_token"]);
      assert.equal(payload.id, result.attempt_id);
      assert.equal(payload.write_token_hash, createHash("sha256").update(result.write_token).digest("hex"));
      assert.ok(!options.body.includes(result.write_token));
    } else {
      assert.equal(response.status, 500);
      assert.deepEqual(result, { error: "ATTEMPT_START_FAILED" });
    }
    assert.deepEqual(h.logs, []);
  }
});
