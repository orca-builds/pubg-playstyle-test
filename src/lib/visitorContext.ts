import { readBrowserValue, writeBrowserValue } from "@/lib/browserStorage";

export const VISITOR_KEY = "pubg-playstyle-test:visitor:v1";
export const SESSION_KEY = "pubg-playstyle-test:session:v1";

export type InitialAttribution = {
  initial_source: string;
  initial_medium: string;
  initial_campaign: string;
  initial_referrer: string;
  landing_page: string;
};
export type VisitorContext = InitialAttribution & {
  anonymous_id: string;
  session_id: string;
  device_type: "mobile" | "tablet" | "desktop";
};
type StoredVisitor = InitialAttribution & { anonymous_id: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Marketing slugs only; arbitrary text, emails and other query parameters are excluded.
function campaignValue(value: string | null, fallback = ""): string {
  return value && /^[a-zA-Z0-9._~-]{1,120}$/.test(value) ? value : fallback;
}

export function readInitialAttribution(href: string, referrer: string): InitialAttribution {
  const url = new URL(href);
  let referrerOrigin = "";
  try { referrerOrigin = new URL(referrer).origin; } catch { /* Direct entry. */ }
  return {
    initial_source: campaignValue(url.searchParams.get("utm_source"), "direct"),
    initial_medium: campaignValue(url.searchParams.get("utm_medium"), "none"),
    initial_campaign: campaignValue(url.searchParams.get("utm_campaign")),
    initial_referrer: referrerOrigin,
    landing_page: url.pathname,
  };
}

function restoreVisitor(raw: string | null): StoredVisitor | undefined {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !uuidPattern.test(value.anonymous_id)) return;
    const keys = ["initial_source", "initial_medium", "initial_campaign", "initial_referrer", "landing_page"] as const;
    if (!keys.every((key) => typeof value[key] === "string")) return;
    return {
      anonymous_id: value.anonymous_id,
      initial_source: value.initial_source, initial_medium: value.initial_medium,
      initial_campaign: value.initial_campaign, initial_referrer: value.initial_referrer,
      landing_page: value.landing_page,
    };
  } catch { return; }
}

/** SDK-independent context, reusable by a future test_attempts/answers writer. */
export function getVisitorContext(): VisitorContext | undefined {
  if (typeof window === "undefined") return;
  try {
    let visitor = restoreVisitor(readBrowserValue("localStorage", VISITOR_KEY));
    if (!visitor) {
      visitor = {
        anonymous_id: crypto.randomUUID(),
        ...readInitialAttribution(window.location.href, document.referrer),
      };
      writeBrowserValue("localStorage", VISITOR_KEY, JSON.stringify(visitor));
    }
    let session = readBrowserValue("sessionStorage", SESSION_KEY);
    if (!session || !uuidPattern.test(session)) {
      session = crypto.randomUUID();
      writeBrowserValue("sessionStorage", SESSION_KEY, session);
    }
    const ua = navigator.userAgent;
    const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    return {
      ...visitor, session_id: session,
      device_type: tablet ? "tablet" : /Mobi|iPhone|Android/i.test(ua) ? "mobile" : "desktop",
    };
  } catch { return; }
}
