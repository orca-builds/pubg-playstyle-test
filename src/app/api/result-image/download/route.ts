import { GET as renderImage } from "@/app/api/result-image/route";
import { parseResultImageRequest } from "@/lib/resultImageRequest";
import { resultImageFilename } from "@/lib/resultImageFile";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const result = parseResultImageRequest(new URL(request.url).searchParams);
  if (!result) return new Response("Invalid image request", { status: 400 });
  const response = await renderImage(request);
  if (!response.ok) return response;
  const filename = encodeURIComponent(resultImageFilename(result.mainResult.name))
    .replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  response.headers.set("Content-Disposition", `attachment; filename="pubg-playstyle-result.png"; filename*=UTF-8''${filename}`);
  return response;
}
