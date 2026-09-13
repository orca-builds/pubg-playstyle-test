import "server-only";

import { questionSet } from "@/data/questions";
import { QUESTION_ORDER_KEY, orderedQuestions } from "@/data/questionOrder";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { isAttemptId, parseAnswerInput } from "@/lib/server/answerInput";
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
  try { body = await request.json(); }
  catch { return json({ error: "INVALID_REQUEST" }, 400); }
  const input = parseAnswerInput(body);
  if (!input) return json({ error: "INVALID_REQUEST" }, 400);

  try {
    const db = createSupabaseAdmin();
    const signal = AbortSignal.timeout(10_000);
    const { data: attempt, error } = await db.from("test_attempts")
      .select("write_token_hash,is_completed,test_version,question_order_key")
      .eq("id", attemptId).abortSignal(signal).maybeSingle().retry(false);
    if (error) return json({ error: "ANSWER_SAVE_FAILED" }, 500);
    if (!attempt) return json({ error: "ATTEMPT_NOT_FOUND" }, 404);
    if (!verifyWriteToken(input.writeToken, attempt.write_token_hash)) return json({ error: "FORBIDDEN" }, 403);
    if (attempt.is_completed) return json({ error: "ATTEMPT_COMPLETED" }, 409);
    if (attempt.test_version !== questionSet.version || attempt.question_order_key !== QUESTION_ORDER_KEY) {
      return json({ error: "ATTEMPT_VERSION_MISMATCH" }, 409);
    }

    // One transaction: lock/recheck parent, upsert answer, then advance the high-water mark.
    // The raw token is never sent to the DB or serialized into a response.
    const { data, error: writeError } = await db.rpc("save_attempt_answer", {
      p_attempt_id: attemptId,
      p_verified_hash: attempt.write_token_hash,
      p_test_version: questionSet.version,
      p_question_order_key: QUESTION_ORDER_KEY,
      p_question_id: input.questionId,
      p_answer_id: input.answerId,
      p_question_index: input.questionIndex,
    }).abortSignal(signal).retry(false);
    if (writeError || !data) return json({ error: "ANSWER_SAVE_FAILED" }, 500);
    if (data.outcome === "not_found") return json({ error: "ATTEMPT_NOT_FOUND" }, 404);
    if (data.outcome === "forbidden") return json({ error: "FORBIDDEN" }, 403);
    if (data.outcome === "completed") return json({ error: "ATTEMPT_COMPLETED" }, 409);
    if (data.outcome === "version_mismatch") return json({ error: "ATTEMPT_VERSION_MISMATCH" }, 409);
    if (data.outcome !== "saved" || typeof data.last_question_index !== "number" ||
        !Number.isInteger(data.last_question_index) || data.last_question_index < input.questionIndex ||
        data.last_question_index > orderedQuestions.length) return json({ error: "ANSWER_SAVE_FAILED" }, 500);
    return json({ saved: true, last_question_index: data.last_question_index }, 200);
  } catch {
    return json({ error: "ANSWER_SAVE_FAILED" }, 500);
  }
}
