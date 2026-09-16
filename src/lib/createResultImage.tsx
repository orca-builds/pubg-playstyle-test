import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toBlob } from "html-to-image";
import ResultImageCard from "@/components/ResultImageCard";
import type { ScoringResult } from "@/lib/scoring";
import { resultImageFilename } from "@/lib/resultImageFile";

export async function createResultImage(result: ScoringResult): Promise<File> {
  if (!result.mainResult.imageSrc || !/^\/images\/results\/\d{2}_[a-z-]+\.png$/.test(result.mainResult.imageSrc)) throw new Error("IMAGE_MISSING");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<ResultImageCard result={result} />));
    const card = host.firstElementChild as HTMLElement;
    const images = Array.from(card.querySelectorAll("img"));
    if (images.length === 0) throw new Error("IMAGE_MISSING");
    await Promise.all(images.map(image => image.decode()));
    await document.fonts.ready;
    if (card.scrollHeight > card.clientHeight || card.scrollWidth > card.clientWidth) throw new Error("CARD_OVERFLOW");
    const blob = await toBlob(card, { width: 540, height: 675, pixelRatio: 2, skipFonts: true, backgroundColor: "#f8fafc" });
    if (!blob) throw new Error("IMAGE_FAILED");
    return new File([blob], resultImageFilename(result.mainResult.name), { type: "image/png" });
  } finally {
    root.unmount();
    host.remove();
  }
}
