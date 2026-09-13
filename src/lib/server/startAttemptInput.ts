import "server-only";

import { questionSet } from "@/data/questions";
import { QUESTION_ORDER_KEY } from "@/data/questionOrder";
import type { VisitorContext } from "@/lib/visitorContext";

type StartAttemptInput = Omit<VisitorContext, "device_type"> & {
  test_version: string;
  is_retry: boolean;
  question_order_key: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slug = /^[a-zA-Z0-9._~-]{1,120}$/;

function isOrigin(value: string): boolean {
  // visitorContext can return an empty referrer or the opaque origin string "null".
  if (value === "" || value === "null") return true;
  try { return new URL(value).origin === value; } catch { return false; }
}

function isPathname(value: string): boolean {
  if (!value.startsWith("/") || /[?#\\\s]/.test(value)) return false;
  try { return new URL(`https://validation.invalid${value}`).pathname === value; }
  catch { return false; }
}

/** Reject invalid attribution instead of silently changing its Analytics meaning. */
export function parseStartAttemptInput(value: unknown): StartAttemptInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const fields = ["anonymous_id", "session_id", "test_version", "initial_source",
    "initial_medium", "initial_campaign", "initial_referrer", "landing_page",
    "question_order_key", "is_retry"];
  if (Object.keys(input).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(input, field)) ||
      !fields.filter((field) => field !== "is_retry").every((field) => typeof input[field] === "string")) return null;

  const { anonymous_id, session_id, test_version, initial_source, initial_medium,
    initial_campaign, initial_referrer, landing_page, question_order_key } = input as Record<string, string>;
  if (anonymous_id.length !== 36 || !uuid.test(anonymous_id) ||
      session_id.length !== 36 || !uuid.test(session_id) ||
      test_version !== questionSet.version || question_order_key !== QUESTION_ORDER_KEY ||
      typeof input.is_retry !== "boolean" ||
      !slug.test(initial_source) || !slug.test(initial_medium) ||
      (initial_campaign !== "" && !slug.test(initial_campaign)) ||
      initial_referrer.length > 2048 || !isOrigin(initial_referrer) ||
      landing_page.length > 2048 || !isPathname(landing_page)) return null;

  return { anonymous_id, session_id, test_version, initial_source, initial_medium,
    initial_campaign, initial_referrer, landing_page, question_order_key, is_retry: input.is_retry };
}
