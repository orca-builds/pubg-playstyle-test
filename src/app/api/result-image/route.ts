import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";
import ResultImageCard from "@/components/ResultImageCard";
import { parseResultImageRequest } from "@/lib/resultImageRequest";
import { resultImageText } from "@/lib/server/resultImageText";

export const runtime = "nodejs";

function pngData(bytes: Buffer) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error("IMAGE_ASSET_INVALID");
  }
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

export async function GET(request: Request) {
  const result = parseResultImageRequest(new URL(request.url).searchParams);
  if (!result) return new Response("Invalid image request", { status: 400 });
  try {
    const imageSrc = result.mainResult.imageSrc;
    if (!imageSrc || !/^\/images\/results\/\d{2}_[a-z-]+\.png$/.test(imageSrc)) throw new Error("IMAGE_MISSING");
    const [character, brand, regular, bold] = await Promise.all([
      readFile(join(cwd(), "public/images/results", imageSrc.split("/").at(-1)!)).then(pngData),
      readFile(join(cwd(), "src/app/icon.png")).then(pngData),
      readFile(join(cwd(), "assets/result-image/NanumGothic-Regular.ttf")),
      readFile(join(cwd(), "assets/result-image/NanumGothic-Bold.ttf")),
    ]);
    const textLines = resultImageText(result.mainResult, regular, bold);
    const image = new ImageResponse(ResultImageCard({ result, character, brand, textLines }), {
      width: 1080, height: 1350,
      fonts: [
        { name: "NanumGothic", data: regular, weight: 400, style: "normal" },
        { name: "NanumGothic", data: bold, weight: 700, style: "normal" },
      ],
    });
    // Rendering is streamed: await it here so asset/render failures return 500, not a partial 200.
    const png = await image.arrayBuffer();
    return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response("Image generation failed", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
