import type { ScoringResult } from "@/lib/scoring";

// Export-only DOM: fixed dimensions and system fonts avoid viewport/font-loading differences.
export default function ResultImageCard({ result }: { result: ScoringResult }) {
  const { mainResult, displaySubTags } = result;
  return (
    <div style={{ width: 540, height: 675, boxSizing: "border-box", padding: "24px 36px", background: "#f8fafc", color: "#0f172a", fontFamily: "Arial, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 16, lineHeight: "24px", color: "#475569" }}>내 배그 플레이 유형은</p>
      <h1 style={{ margin: 0, fontSize: 34, lineHeight: "44px", fontWeight: 800, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{mainResult.name}</h1>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, flexShrink: 0 }}>
        {displaySubTags.slice(0, 2).map(tag => <span key={tag} style={{ padding: "4px 12px", borderRadius: 999, background: "#eff6ff", color: "#475569", fontSize: 13, lineHeight: "20px", whiteSpace: "nowrap", fontWeight: 500 }}>{tag}</span>)}
      </div>
      {/* Native image preserves the original local asset in the exported PNG. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mainResult.imageSrc ?? ""} alt="" width={280} height={280} style={{ width: 280, height: 280, objectFit: "contain", flexShrink: 0, borderRadius: 20, background: "#fff" }} />
      <p style={{ margin: 0, fontSize: 18, lineHeight: "26px", flexShrink: 0, fontWeight: 600, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{mainResult.summary}</p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: "21px", flexShrink: 0, color: "#5B6472", whiteSpace: "normal", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{mainResult.description}</p>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap" }}>
        {/* Reuse the App Router favicon asset without copying it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" width={18} height={18} style={{ width: 18, height: 18, objectFit: "contain" }} />
        <span style={{ fontSize: 14, lineHeight: "18px", color: "#1e3a8a", fontWeight: 600 }}>PUBG 플레이스타일 테스트</span>
      </div>
    </div>
  );
}
