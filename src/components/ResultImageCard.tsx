import type { ScoringResult } from "@/lib/scoring";
import type { ResultImageText } from "@/lib/server/resultImageText";

// Server ImageResponse card. Dimensions and spacing match the previous 2x export.
export default function ResultImageCard({ result, textLines, character, brand = "/icon.png" }: { result: Pick<ScoringResult, "mainResult" | "displaySubTags">; textLines: ResultImageText; character?: string; brand?: string }) {
  const { mainResult, displaySubTags } = result;
  return (
    <div style={{ width: 1080, height: 1350, boxSizing: "border-box", padding: "48px 72px", background: "#f8fafc", color: "#0f172a", fontFamily: "NanumGothic", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 20 }}>
      <p style={{ margin: 0, fontSize: 32, lineHeight: "48px", color: "#475569" }}>내 배그 플레이 유형은</p>
      <h1 style={{ margin: 0, fontSize: 68, lineHeight: "88px", fontWeight: 800, whiteSpace: "pre", flexShrink: 0 }}>{textLines.name.join("\n")}</h1>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexShrink: 0 }}>
        {displaySubTags.slice(0, 2).map(tag => <span key={tag} style={{ padding: "8px 24px", borderRadius: 1998, background: "#eff6ff", color: "#475569", fontSize: 26, lineHeight: "40px", whiteSpace: "nowrap", fontWeight: 500 }}>{tag}</span>)}
      </div>
      {/* Native image preserves the original local asset in the exported PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={character ?? mainResult.imageSrc ?? ""} alt="" width={560} height={560} style={{ width: 560, height: 560, objectFit: "contain", flexShrink: 0, borderRadius: 40, background: "#fff" }} />
      <p style={{ margin: 0, fontSize: 36, lineHeight: "52px", flexShrink: 0, fontWeight: 600, whiteSpace: "pre" }}>{textLines.summary.join("\n")}</p>
      <p style={{ margin: 0, fontSize: 28, lineHeight: "42px", flexShrink: 0, color: "#5B6472", whiteSpace: "pre" }}>{textLines.description.join("\n")}</p>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexShrink: 0, whiteSpace: "nowrap" }}>
        {/* Reuse the App Router favicon asset without copying it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: "contain" }} />
        <span style={{ fontSize: 28, lineHeight: "36px", color: "#1e3a8a", fontWeight: 600 }}>PUBG 플레이스타일 테스트</span>
      </div>
    </div>
  );
}
