import type { PostHog } from "posthog-js";
import { questionSet } from "@/data/questions";
import { getVisitorContext } from "@/lib/visitorContext";
import { readBrowserValue, writeBrowserValue } from "@/lib/browserStorage";

let client: PostHog | undefined;
let initialization: Promise<void> | undefined;
let failed = false;
const pending: { eventName: string; properties: Record<string, unknown> }[] = [];

export type AnalyticsEvent = "landing_view" | "cta_click" | "test_start" |
  "question_view" | "question_answer" | "question_back" | "answer_change" |
  "test_complete" | "result_view" | "retry_click";
type Once = { scope: "localStorage" | "sessionStorage"; key: string };

function capture(eventName: string, properties: Record<string, unknown>): void {
  try { client?.capture(eventName, properties); } catch { /* Never block the UI. */ }
}

// Strip arbitrary query/hash data from SDK-generated properties too.
function sanitizeProperties(properties: Record<string, unknown>): void {
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    if (/^(\$initial_)?utm_/.test(key)) {
      delete properties[key];
    } else if (["$current_url", "$initial_current_url", "$referrer", "$initial_referrer"].includes(key) && typeof value === "string") {
      try {
        const url = new URL(value);
        properties[key] = key.includes("referrer") ? url.origin : `${url.origin}${url.pathname}`;
      } catch { properties[key] = ""; }
    } else if ((key === "$set" || key === "$set_once") && value && typeof value === "object") {
      sanitizeProperties(value as Record<string, unknown>);
    }
  }
}

/** Optional analytics must never prevent the test from running. */
export function initializeAnalytics(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  getVisitorContext(); // Preserve the entry URL before SPA navigation or SDK loading.
  if (initialization) return initialization;

  // Keep direct env references so Next.js can inline public values at build time.
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!key || !host) return Promise.resolve();

  try {
    const url = new URL(host);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      return Promise.resolve();
    }
  } catch {
    return Promise.resolve();
  }

  // Share one attempt across callers, including while the SDK is loading.
  // A small bounded queue preserves early UI events while the SDK loads.
  initialization = import("posthog-js")
    .then(({ default: posthog }) => {
      client = posthog.init(key, {
        api_host: host,
        defaults: "2026-01-30",
        capture_pageview: "history_change",
        capture_pageleave: false,
        autocapture: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        person_profiles: "identified_only",
        save_referrer: false,
        save_campaign_params: false,
        before_send: (event) => {
          if (event) sanitizeProperties(event.properties);
          return event;
        },
        debug: false,
      });
      for (const event of pending.splice(0)) capture(event.eventName, event.properties);
      if (!client) failed = true;
    })
    .catch(() => {
      client = undefined;
      failed = true;
      pending.length = 0;
    });

  return initialization;
}

/** True means accepted locally, not a server delivery acknowledgement. */
export function trackEvent(
  eventName: AnalyticsEvent,
  properties: Record<string, unknown> = {},
  once?: Once,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    void initializeAnalytics();
    if (!initialization || failed || (!client && pending.length >= 100)) return false;
    const context = getVisitorContext();
    if (!context) return false;
    const key = once ? `pubg-playstyle-test:analytics:sent:${once.key}` : undefined;
    if (once && key && readBrowserValue(once.scope, key) === "1") return false;
    const url = new URL(window.location.href);
    const enriched = {
      ...properties, ...context, test_version: properties.test_version ?? questionSet.version,
      $current_url: `${url.origin}${url.pathname}`,
    };
    // Reserve before dispatch to suppress Strict Mode and refresh duplicates.
    if (once && key) writeBrowserValue(once.scope, key, "1");
    if (client) capture(eventName, enriched);
    else pending.push({ eventName, properties: enriched });
    return true;
  } catch {
    // Analytics failures must not interrupt answers, persistence, or navigation.
    return false;
  }
}
