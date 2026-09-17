import "server-only";
import loadFont from "next/dist/compiled/@next/font/dist/fontkit";
import { splitImageText } from "@/lib/splitImageText";
import type { ResultType } from "@/types/test";

export type ResultImageText = { name: string[]; summary: string[]; description: string[] };

// Isolate Next's bundled font reader here; no browser metrics or extra dependency.
export function resultImageText(result: ResultType, regular: Buffer, bold: Buffer): ResultImageText {
  const normalFont = loadFont(regular);
  const boldFont = loadFont(bold);
  const measure = (font: typeof normalFont, size: number) => (text: string) =>
    font.layout(text).advanceWidth * size / font.unitsPerEm;
  // 1080 - 2 * 72px padding, with 4px reserved for raster rounding.
  const width = 932;
  return {
    name: splitImageText(result.name, width, measure(boldFont, 68)),
    summary: splitImageText(result.summary, width, measure(boldFont, 36)),
    description: splitImageText(result.description, width, measure(normalFont, 28), 4),
  };
}
