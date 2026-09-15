import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createHarness } from "./helpers/analyticsHarness.mjs";

const token = "A".repeat(43);
const hash = createHash("sha256").update(token).digest("hex");
function setup(options = {}) {
  let h;
  const id = randomUUID();
  const requests = [];
  let saved = null;
  let writes = 0;
  const db = createClient("https://db.example.invalid", "fake-secret", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, request) => {
      const path = new URL(url).pathname;
      requests.push({ path, request });
      if (options.throw) throw new Error("private-db-secret");
      if (options.fail === path) return Response.json({ message: "private-db-secret", details: token }, { status: 500 });
      if (path === "/rest/v1/test_attempts") return Response.json(options.missing ? [] : [{
        write_token_hash: hash, test_version: options.version ?? "v2",
        question_order_key: h.load("src/data/questionOrder.ts").QUESTION_ORDER_KEY,
      }]);
      if (path === "/rest/v1/answers") return Response.json(options.answers ?? answers);
      if (options.outcome) return Response.json({ outcome: options.outcome });
      const payload = JSON.parse(request.body);
      if (!saved) {
        writes += 1;
        saved = { is_completed: true, completed_at: "2026-09-10T01:00:05.000Z", started_at: "2026-09-10T01:00:00.000Z",
          duration_seconds: 5, last_question_index: 24, ...payload.p_result,
          answer_change_count: payload.p_answer_change_count, back_count: payload.p_back_count };
        return Response.json({ outcome: "completed", ...saved, ...options.receiptOverrides });
      }
      return Response.json({ outcome: "already_completed", ...saved });
    } },
  });
  h = createHarness({ mocks: { "server-only": {}, "@/lib/server/supabaseAdmin": { createSupabaseAdmin() {
    if (options.initError) throw new Error("private-secret");
    return db;
  } } } });
  const questions = h.load("src/data/questionOrder.ts").orderedQuestions;
  const answers = questions.map(question => ({ question_id: question.id, answer_id: question.choices[0].id }));
  const result = h.load("src/lib/scoring.ts").calculateScore(answers.map(answer => ({ questionId: answer.question_id, choiceId: answer.answer_id })));
  const columns = h.load("src/lib/completionResult.ts").toResultColumns(result);
  const body = { write_token: token, duration_seconds: 1, ...columns, answer_change_count: 2, back_count: 3 };
  const route = h.load("src/app/api/attempts/[attemptId]/complete/route.ts");
  const post = (input = body, attemptId = id) => route.POST(new Request("https://example.invalid", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }), { params: Promise.resolve({ attemptId }) });
  return { ...h, route, post, body, columns, answers, requests, id, get saved() { return saved; }, get writes() { return writes; } };
}

test("24 valid DB answers are recalculated and all canonical columns reach completion RPC", async () => {
  const h = setup();
  const response = await h.post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, { completed: true, already_completed: false,
    started_at: h.saved.started_at, completed_at: h.saved.completed_at, duration_seconds: 5,
    answer_change_count: 2, back_count: 3, result: h.columns });
  assert.equal(h.saved.is_completed, true);
  assert.equal(h.saved.last_question_index, 24);
  assert.ok(!JSON.stringify(body).includes(token));
  assert.ok(!JSON.stringify(body).includes(hash));
  const payload = JSON.parse(h.requests[2].request.body);
  assert.equal(payload.p_test_version, "v2");
  assert.deepEqual(payload.p_result, h.columns);
  assert.deepEqual(payload.p_answers, h.answers);
  assert.equal(payload.p_verified_hash, hash);
  assert.ok(!h.requests[2].request.body.includes(token));
  assert.equal(payload.duration_seconds, undefined);
});

test("missing, duplicate, foreign question and invalid choice DB answers cannot complete", async () => {
  const valid = setup().answers;
  for (const answers of [valid.slice(0, 23), [...valid.slice(1), valid[1]],
    [...valid.slice(1), { question_id: "unknown", answer_id: "unknown" }],
    [{ ...valid[0], answer_id: valid[1].answer_id }, ...valid.slice(1)]]) {
    const h = setup({ answers });
    assert.equal((await h.post()).status, 409);
    assert.equal(h.writes, 0);
    assert.equal(h.requests.length, 2);
  }
});

test("bad UUID, missing fields and invalid score/count/duration payloads fail with 400", async () => {
  const h = setup();
  assert.equal((await h.post(h.body, "bad")).status, 400);
  for (const key of Object.keys(h.body)) {
    const input = { ...h.body }; delete input[key];
    assert.equal((await h.post(input)).status, 400, key);
  }
  for (const [key, value] of [["duration_seconds", -1], ["duration_seconds", null], ["duration_seconds", 86401],
    ["combat_score", -1], ["combat_score", 1.5], ["back_count", 2147483648], ["answer_change_count", "1"],
    ["main_type", "unknown"], ["top_sub_tag_1", {}], ["is_completed", true]]) {
    assert.equal((await h.post({ ...h.body, [key]: value })).status, 400, key);
  }
  assert.equal(h.requests.length, 0);
});

test("tampered valid-shape result scores and tags are rejected instead of saved", async () => {
  const h = setup();
  for (const [key, value] of [["combat_score", h.body.combat_score + 1], ["top_sub_tag_1", "fake-tag"], ["top_sub_tag_2", "fake-tag"]]) {
    const response = await h.post({ ...h.body, [key]: value });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "RESULT_MISMATCH" });
  }
  assert.equal(h.writes, 0);
});

test("wrong token is 403, missing attempt is 404, unsupported version is 409", async () => {
  const h = setup();
  for (const write_token of ["bad", hash, "B".repeat(43)]) {
    assert.equal((await h.post({ ...h.body, write_token })).status, 403);
  }
  assert.equal(h.requests.length, 3);
  assert.equal((await setup({ missing: true }).post()).status, 404);
  assert.equal((await setup({ version: "v1" }).post()).status, 409);
});

test("repeat completion returns already_completed and preserves the first timestamps/counts (RPC contract)", async () => {
  const h = setup();
  const first = await (await h.post()).json();
  const second = await (await h.post({ ...h.body, duration_seconds: 50, back_count: 100 })).json();
  assert.deepEqual(second, { ...first, already_completed: true });
  assert.equal(h.writes, 1);
});

test("locked transaction can reject an answer change or ownership/version race before update", async () => {
  for (const [outcome, status] of [["answers_changed", 409], ["version_mismatch", 409], ["expired", 409], ["not_found", 404], ["forbidden", 403]]) {
    const h = setup({ outcome });
    assert.equal((await h.post()).status, status);
    assert.equal(h.writes, 0);
  }
});

test("DB/init/transport failures and unexpected RPC replies return safe 500 without retries", async () => {
  for (const options of [{ fail: "/rest/v1/test_attempts" }, { fail: "/rest/v1/answers" },
    { fail: "/rest/v1/rpc/complete_attempt" }, { throw: true }, { initError: true }, { outcome: "unexpected" }]) {
    const h = setup(options);
    const response = await h.post();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "COMPLETE_FAILED" });
    assert.ok(h.requests.length <= 3);
  }
});

test("malformed JSON and wrong content type are rejected safely", async () => {
  const h = setup();
  for (const [contentType, status] of [["application/json", 400], ["text/plain", 415]]) {
    const response = await h.route.POST(new Request("https://example.invalid", {
      method: "POST", headers: { "Content-Type": contentType }, body: "{private",
    }), { params: Promise.resolve({ attemptId: h.id }) });
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes("private"));
  }
});

test("invalid DB completion counters never escape as a successful API response", async () => {
  for (const receiptOverrides of [{ answer_change_count: -1 }, { back_count: -1 },
    { answer_change_count: 2_147_483_648 }, { back_count: 2_147_483_648 }]) {
    const response = await setup({ receiptOverrides }).post();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "COMPLETE_FAILED" });
  }
});

test("migration locks the answer writer's parent, verifies snapshot, updates once and uses DB time", () => {
  const sql = readFileSync(new URL("../supabase/migrations/003_complete_attempt.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /where id = p_attempt_id for update/i);
  assert.match(sql, /current_answers is distinct from expected_answers/i);
  assert.ok(sql.indexOf("if not attempt.is_completed then") < sql.indexOf("update public.test_attempts"));
  assert.match(sql, /finished_at := clock_timestamp\(\)/);
  assert.match(sql, /finished_at - attempt.started_at/);
  assert.match(sql, /security invoker\s+set search_path = ''/i);
  assert.match(sql, /revoke all on function[^;]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[^;]+to service_role/i);
  for (const field of Object.keys(setup().columns)) assert.ok(sql.includes(field), field);
  assert.doesNotMatch(sql, /set updated_at|security definer/i);
  const route = readFileSync(new URL("../src/app/api/attempts/[attemptId]/complete/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /console\.|\.\.\.body|\.\.\.input/);
});
