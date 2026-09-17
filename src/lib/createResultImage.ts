import type { ScoringResult } from "@/lib/scoring";
import { resultImageRequestUrl } from "@/lib/resultImageRequest";

// Every platform consumes the same server-rendered PNG; no client DOM capture.
export async function createResultImage(result: ScoringResult): Promise<Blob> {
  const response = await fetch(resultImageRequestUrl(result), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png") {
    throw new Error("IMAGE_REQUEST_FAILED");
  }
  const blob = await response.blob();
  const header = new DataView(await blob.slice(0, 24).arrayBuffer());
  if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(16) !== 1080 || header.getUint32(20) !== 1350) throw new Error("IMAGE_RESPONSE_INVALID");
  return blob;
}
