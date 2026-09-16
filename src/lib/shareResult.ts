import { trackEvent } from "@/lib/analytics";
import { resultTypes } from "@/data/resultTypes";

export const SHARE_BUTTON_LABEL = "결과 공유하기";
export const SHARE_ERROR = "공유하지 못했어요. 다시 시도해주세요.";

export function createSharePayload(currentUrl: string, mainType: string) {
  const path = Object.prototype.hasOwnProperty.call(resultTypes, mainType) ? `/share/${mainType}` : "/";
  const url = new URL(path, new URL(currentUrl).origin);
  url.search = new URLSearchParams({
    utm_source: "share", utm_medium: "user_share", utm_campaign: "launch",
  }).toString();
  return {
    url: url.toString(),
  };
}

type ShareContext = { attemptId: string; testVersion: string; mainType: string; typeName: string };
type ShareBrowser = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};
export type ShareOutcome = "shared" | "copied" | "cancelled" | "error";

export async function shareResult(
  context: ShareContext,
  browser: ShareBrowser = navigator,
  currentUrl: string = window.location.href,
): Promise<ShareOutcome> {
  const method = typeof browser.share === "function" ? "web_share" : "clipboard";
  const properties = {
    attempt_id: context.attemptId, test_version: context.testVersion,
    main_type: context.mainType, share_method: method,
  };
  trackEvent("share_click", properties);
  try {
    const payload = createSharePayload(currentUrl, context.mainType);
    if (method === "web_share") {
      // Invoke within the click's user activation; do not await analytics first.
      await browser.share!(payload);
      trackEvent("share_success", properties);
      return "shared";
    }
    if (!browser.clipboard?.writeText) return "error";
    await browser.clipboard.writeText(payload.url);
    trackEvent("copy_link", properties);
    return "copied";
  } catch (error) {
    if (method === "web_share" && error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    // Never surface browser error messages or copy automatically after cancellation.
    return "error";
  }
}
