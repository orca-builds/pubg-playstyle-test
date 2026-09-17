export function resultImageFilename(name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/g, "").slice(0, 80);
  return `pubg-playstyle-${safe || "result"}.png`;
}

export function downloadResultImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadPreparedResultImage(url, filename);
}

export function isIOSBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

// Takes ownership of the URL, including when preparing the anchor fails.
export function downloadPreparedResultImage(url: string, filename: string): void {
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    // Allow Safari to consume the URL before releasing the PNG memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
import type { ScoringResult } from "@/lib/scoring";
import { resultImageRequestUrl } from "@/lib/resultImageRequest";

// Call synchronously in the user's tap, before awaiting PNG generation.
export function downloadServerResultImage(result: ScoringResult): void {
  const url = resultImageRequestUrl(result).replace("/api/result-image?", "/api/result-image/download?");
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = resultImageFilename(result.mainResult.name);
    // Keep the result page and its preview fallback available if the server fails.
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
  }
}
