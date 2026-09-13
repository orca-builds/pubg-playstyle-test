import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { parseStartAttemptInput } from "@/lib/server/startAttemptInput";
import { generateWriteToken, hashWriteToken } from "@/lib/server/writeToken";
import type { TestAttemptInsert } from "@/types/database";

export const runtime = "nodejs";

function json(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: "INVALID_REQUEST" }, 400); }
  const input = parseStartAttemptInput(body);
  if (!input) return json({ error: "INVALID_REQUEST" }, 400);

  try {
    const attemptId = randomUUID();
    const token = generateWriteToken();
    const payload: TestAttemptInsert = {
      id: attemptId,
      write_token_hash: hashWriteToken(token),
      anonymous_id: input.anonymous_id,
      session_id: input.session_id,
      test_version: input.test_version,
      initial_source: input.initial_source,
      initial_medium: input.initial_medium,
      initial_campaign: input.initial_campaign,
      initial_referrer: input.initial_referrer,
      landing_page: input.landing_page,
      is_retry: input.is_retry,
      question_order_key: input.question_order_key,
      started_at: new Date().toISOString(),
      is_completed: false,
      last_question_index: 0,
    };
    // No SELECT/row serialization and no automatic retry for this non-idempotent operation.
    const { error } = await createSupabaseAdmin().from("test_attempts").insert(payload)
      .abortSignal(AbortSignal.timeout(10_000)).retry(false);
    if (error) return json({ error: "ATTEMPT_START_FAILED" }, 500);
    return json({ attempt_id: attemptId, write_token: token }, 201);
  } catch {
    // Never expose SDK errors, stack traces, credentials, or the generated token.
    return json({ error: "ATTEMPT_START_FAILED" }, 500);
  }
}
