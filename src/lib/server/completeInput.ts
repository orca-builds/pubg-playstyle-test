import "server-only";

import { RESULT_FIELDS, SCORE_FIELDS } from "@/lib/completionResult";
import { resultTypes } from "@/data/resultTypes";

export function parseCompleteInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const fields = ["write_token", "duration_seconds", ...RESULT_FIELDS, "answer_change_count", "back_count"];
  if (Object.keys(input).length !== fields.length || !fields.every(field => Object.hasOwn(input, field)) ||
      typeof input.write_token !== "string" || typeof input.main_type !== "string" ||
      !Object.hasOwn(resultTypes, input.main_type) || typeof input.duration_seconds !== "number" ||
      !Number.isFinite(input.duration_seconds) || input.duration_seconds < 0 || input.duration_seconds > 86_400) return null;
  for (const field of [...SCORE_FIELDS, "answer_change_count", "back_count"]) {
    const number = input[field];
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > 2_147_483_647) return null;
  }
  for (const field of ["top_sub_tag_1", "top_sub_tag_2"]) {
    if (input[field] !== null && (typeof input[field] !== "string" || input[field].length > 120)) return null;
  }
  return { fields: input, writeToken: input.write_token,
    answerChangeCount: input.answer_change_count as number, backCount: input.back_count as number };
}
