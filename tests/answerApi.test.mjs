import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const token = "A".repeat(43);
const hash = createHash("sha256").update(token).digest("hex");
const privateError = "private-db-details-and-fake-service-secret";

function setup(options = {}) {
  const requests = [];
  const answers = new Map();
  const id = randomUUID();
  let highest = 0;
  let tick = 0;
  let h;
  const db = createClient("https://db.example.invalid", "fake-service-secret", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, request) => {
      requests.push({ url: new URL(url), request });
      if (options.throw) throw new Error(privateError);
      if (request.method === "GET") {
        if (options.lookupError) return Response.json({ message: privateError }, { status: 500 });
        return Response.json(options.missing ? [] : [{ write_token_hash: hash,
          is_completed: options.completed ?? false,
          test_version: options.version ?? "v1",
          question_order_key: options.order ?? h.load("src/data/questionOrder.ts").QUESTION_ORDER_KEY }]);
      }
      if (options.writeError) return Response.json({ message: privateError, details: token }, { status: 500 });
      if (options.outcome) return Response.json({ outcome: options.outcome });
      const payload = JSON.parse(request.body);
      const previous = answers.get(payload.p_question_id);
      const now = ++tick;
      answers.set(payload.p_question_id, { attempt_id: payload.p_attempt_id, question_id: payload.p_question_id,
        answer_id: payload.p_answer_id, created_at: previous?.created_at ?? now, answered_at: now, updated_at: now });
      highest = Math.max(highest, payload.p_question_index);
      return Response.json({ outcome: "saved", last_question_index: highest });
    } },
  });
  h = createHarness({ mocks: { "server-only": {}, "@/lib/server/supabaseAdmin": { createSupabaseAdmin() {
    if (options.initError) throw new Error(privateError);
    return db;
  } } } });
  const route = h.load("src/app/api/attempts/[attemptId]/answers/route.ts");
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  const body = { write_token: token, question_id: questions[0].id, answer_id: questions[0].choices[0].id, question_index: 1 };
  const post = (input = body, attemptId = id) => route.POST(new Request("https://example.invalid/api/attempts/" + attemptId + "/answers", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }), { params: Promise.resolve({ attemptId }) });
  return { ...h, route, post, body, requests, answers, id, questions, get highest() { return highest; } };
}

test("answer route authenticates with real SDK lookup then sends an allowlisted RPC without raw token", async () => {
  const h = setup();
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { saved: true, last_question_index: 1 });
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].url.pathname, "/rest/v1/test_attempts");
  assert.equal(h.requests[0].url.searchParams.get("id"), `eq.${h.id}`);
  assert.equal(h.requests[0].url.searchParams.get("select"), "write_token_hash,is_completed,test_version,question_order_key");
  assert.equal(h.requests[1].url.pathname, "/rest/v1/rpc/save_attempt_answer");
  assert.deepEqual(JSON.parse(h.requests[1].request.body), { p_attempt_id: h.id, p_verified_hash: hash,
    p_test_version: "v1", p_question_order_key: h.load("src/data/questionOrder.ts").QUESTION_ORDER_KEY,
    p_question_id: h.body.question_id, p_answer_id: h.body.answer_id, p_question_index: 1 });
  assert.ok(!h.requests[1].request.body.includes(token));
});

test("same question saves/changes keep a single row; lower questions do not decrease the high-water mark (RPC contract)", async () => {
  const h = setup();
  await h.post();
  const created = h.answers.get(h.body.question_id).created_at;
  await h.post();
  const before = h.answers.get(h.body.question_id).answered_at;
  await h.post({ ...h.body, answer_id: h.questions[0].choices[1].id });
  assert.equal(h.answers.size, 1);
  assert.equal(h.answers.get(h.body.question_id).created_at, created);
  assert.equal(h.answers.get(h.body.question_id).answer_id, h.questions[0].choices[1].id);
  assert.ok(h.answers.get(h.body.question_id).answered_at > before);
  const fifth = { ...h.body, question_id: h.questions[4].id, answer_id: h.questions[4].choices[0].id, question_index: 5 };
  assert.deepEqual(await (await h.post(fifth)).json(), { saved: true, last_question_index: 5 });
  assert.deepEqual(await (await h.post()).json(), { saved: true, last_question_index: 5 });
});

test("answer validation rejects bad UUID, missing/extra fields, wrong choices and wrong displayed index before DB access", async () => {
  const h = setup();
  for (const id of ["bad", h.id + "\n", "00000000-0000-0000-0000-000000000000"]) {
    assert.equal((await h.post(h.body, id)).status, 400);
  }
  const invalid = [null, [], {}, ...Object.keys(h.body).map(key => {
    const copy = { ...h.body }; delete copy[key]; return copy;
  })];
  for (const [key, value] of [["question_id", "unknown"], ["answer_id", h.questions[1].choices[0].id],
    ["answer_id", "q01-choice-3"], ["question_index", 0], ["question_index", 25], ["question_index", 1.5],
    ["question_index", "1"], ["question_index", 2], ["write_token", null], ["answered_at", "injected"], ["write_token_hash", hash]]) {
    invalid.push({ ...h.body, [key]: value });
  }
  for (const body of invalid) {
    const response = await h.post(body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INVALID_REQUEST" });
  }
  assert.equal(h.requests.length, 0);
});

test("validation uses the displayed order for all 24 questions, not the management question array", async () => {
  const h = setup();
  for (const [index, question] of h.questions.entries()) {
    const response = await h.post({ ...h.body, question_id: question.id,
      answer_id: question.choices[0].id, question_index: index + 1 });
    assert.equal(response.status, 200);
  }
  assert.equal(h.highest, 24);
  assert.equal(h.answers.size, 24);
});

test("wrong tokens are consistently 403 and cannot write, including hash-as-token", async () => {
  const h = setup();
  for (const value of ["", "bad", "B".repeat(43), hash, token + "\n"]) {
    const response = await h.post({ ...h.body, write_token: value });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "FORBIDDEN" });
  }
  assert.ok(h.requests.every(({ request }) => request.method === "GET"));
});

test("missing attempts are 404; completed or unsupported version/order are 409 with no writes", async () => {
  for (const [options, status, error] of [[{ missing: true }, 404, "ATTEMPT_NOT_FOUND"],
    [{ completed: true }, 409, "ATTEMPT_COMPLETED"], [{ version: "old" }, 409, "ATTEMPT_VERSION_MISMATCH"],
    [{ order: "old" }, 409, "ATTEMPT_VERSION_MISMATCH"]]) {
    const h = setup(options);
    const response = await h.post();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
    assert.equal(h.requests.length, 1);
  }
});

test("transaction rechecks ownership/completion/version after the initial lookup", async () => {
  for (const [outcome, status] of [["not_found", 404], ["forbidden", 403], ["completed", 409], ["version_mismatch", 409]]) {
    assert.equal((await setup({ outcome }).post()).status, status);
  }
});

test("DB, RPC and initialization failures are sanitized 500s without automatic retries", async () => {
  for (const options of [{ lookupError: true }, { writeError: true }, { throw: true }, { initError: true }, { outcome: "unexpected" }]) {
    const h = setup(options);
    const response = await h.post();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "ANSWER_SAVE_FAILED" });
    assert.ok(h.requests.length <= (options.writeError || options.outcome ? 2 : 1));
  }
});

test("malformed JSON and unsupported content type fail before DB access", async () => {
  const h = setup();
  for (const [contentType, status] of [["application/json", 400], ["text/plain", 415]]) {
    const response = await h.route.POST(new Request("https://example.invalid", {
      method: "POST", headers: { "Content-Type": contentType }, body: "{private",
    }), { params: Promise.resolve({ attemptId: h.id }) });
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes("private"));
  }
  assert.equal(h.requests.length, 0);
});

test("SQL transaction uses parent locking, ON CONFLICT, GREATEST and service-role-only execution", () => {
  const sql = readFileSync(new URL("../supabase/migrations/002_save_attempt_answer.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "");
  assert.match(sql, /where id = p_attempt_id for update/i);
  assert.match(sql, /on conflict \(attempt_id, question_id\) do update\s+set answer_id = excluded.answer_id, answered_at = excluded.answered_at/i);
  assert.match(sql, /greatest\(last_question_index, p_question_index\)/i);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /security invoker\s+set search_path = ''/i);
  assert.match(sql, /revoke all on function[^;]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[^;]+to service_role/i);
  assert.doesNotMatch(sql, /security definer|set created_at|set updated_at/i);
  const route = readFileSync(new URL("../src/app/api/attempts/[attemptId]/answers/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /console\.|trackEvent|\.\.\.body|\.\.\.input/);
});
