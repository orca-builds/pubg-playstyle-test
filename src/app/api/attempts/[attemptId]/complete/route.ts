import "server-only";

import { questionSet } from "@/data/questions";
import { QUESTION_ORDER_KEY } from "@/data/questionOrder";
import { calculateScore } from "@/lib/scoring";
import { matchesResult, toResultColumns } from "@/lib/completionResult";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isAttemptId } from "@/lib/server/answerInput";
import { parseCompleteInput } from "@/lib/server/completeInput";
import { verifyWriteToken } from "@/lib/server/writeToken";

export const runtime = "nodejs";
function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  if (!isAttemptId(attemptId)) return json({ error: "INVALID_REQUEST" }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
  const input = parseCompleteInput(body);
  if (!input) return json({ error: "INVALID_REQUEST" }, 400);

  try {
    const db = createSupabaseAdmin();
    const signal = AbortSignal.timeout(10_000);
    const { data: attempt, error } = await db.from("test_attempts")
      .select("write_token_hash,test_version,question_order_key").eq("id", attemptId)
      .abortSignal(signal).maybeSingle().retry(false);
    if (error) return json({ error: "COMPLETE_FAILED" }, 500);
    if (!attempt) return json({ error: "ATTEMPT_NOT_FOUND" }, 404);
    if (!verifyWriteToken(input.writeToken, attempt.write_token_hash)) return json({ error: "FORBIDDEN" }, 403);
    if (attempt.test_version !== questionSet.version || attempt.question_order_key !== QUESTION_ORDER_KEY) {
      return json({ error: "ATTEMPT_VERSION_MISMATCH" }, 409);
    }
    const { data: answers, error: answerError } = await db.from("answers")
      .select("question_id,answer_id").eq("attempt_id", attemptId).abortSignal(signal).retry(false);
    if (answerError || !answers) return json({ error: "COMPLETE_FAILED" }, 500);
    if (answers.length !== questionSet.questions.length) return json({ error: "ANSWERS_NOT_READY" }, 409);
    let result;
    try {
      result = calculateScore(answers.map(answer => ({ questionId: answer.question_id, choiceId: answer.answer_id })));
    } catch { return json({ error: "ANSWERS_NOT_READY" }, 409); }
    if (!matchesResult(input.fields, result)) return json({ error: "RESULT_MISMATCH" }, 400);

    const { data, error: completionError } = await db.rpc("complete_attempt", {
      p_attempt_id: attemptId, p_verified_hash: attempt.write_token_hash,
      p_test_version: questionSet.version, p_question_order_key: QUESTION_ORDER_KEY,
      p_answers: answers.map(answer => ({ question_id: answer.question_id, answer_id: answer.answer_id })),
      p_result: toResultColumns(result),
      p_answer_change_count: input.answerChangeCount, p_back_count: input.backCount,
    }).abortSignal(signal).retry(false);
    if (completionError || !data) return json({ error: "COMPLETE_FAILED" }, 500);
    if (data.outcome === "not_found") return json({ error: "ATTEMPT_NOT_FOUND" }, 404);
    if (data.outcome === "forbidden") return json({ error: "FORBIDDEN" }, 403);
    if (["version_mismatch", "answers_changed", "expired"].includes(data.outcome)) {
      return json({ error: data.outcome === "answers_changed" ? "ANSWERS_CHANGED" : "ATTEMPT_NOT_COMPLETABLE" }, 409);
    }
    if (!["completed", "already_completed"].includes(data.outcome) ||
        typeof data.started_at !== "string" || typeof data.completed_at !== "string" ||
        !Number.isFinite(Date.parse(data.started_at)) || !Number.isFinite(Date.parse(data.completed_at)) ||
        Date.parse(data.completed_at) < Date.parse(data.started_at) ||
        typeof data.duration_seconds !== "number" || !Number.isFinite(data.duration_seconds) ||
        data.duration_seconds < 0 || data.duration_seconds > 86_400 ||
        typeof data.answer_change_count !== "number" || !Number.isInteger(data.answer_change_count) ||
        data.answer_change_count < 0 || data.answer_change_count > 2_147_483_647 ||
        typeof data.back_count !== "number" || !Number.isInteger(data.back_count) ||
        data.back_count < 0 || data.back_count > 2_147_483_647) {
      return json({ error: "COMPLETE_FAILED" }, 500);
    }
    return json({ completed: true, already_completed: data.outcome === "already_completed",
      started_at: data.started_at, completed_at: data.completed_at, duration_seconds: data.duration_seconds,
      answer_change_count: data.answer_change_count, back_count: data.back_count,
      result: toResultColumns(result) }, 200);
  } catch { return json({ error: "COMPLETE_FAILED" }, 500); }
}
