import { readFileSync } from "node:fs";
import { createHarness } from "./analyticsHarness.mjs";
export const regular = readFileSync(new URL("../../assets/result-image/NanumGothic-Regular.ttf", import.meta.url));
export const bold = readFileSync(new URL("../../assets/result-image/NanumGothic-Bold.ttf", import.meta.url));
const layout = createHarness().load("src/lib/server/resultImageText.ts").resultImageText;
export const imageText = result => layout(result, regular, bold);
