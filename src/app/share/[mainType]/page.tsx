import type { Metadata } from "next";
import LandingContent from "@/components/LandingContent";
import { resultTypes } from "@/data/resultTypes";

type Props = { params: Promise<{ mainType: string }> };

// 알려진 유형은 metadata까지 미리 렌더링합니다. 알 수 없는 유형도 랜딩을 제공합니다.
export function generateStaticParams() {
  return Object.keys(resultTypes).map(mainType => ({ mainType }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mainType } = await params;
  if (!Object.prototype.hasOwnProperty.call(resultTypes, mainType)) return {};
  const result = resultTypes[mainType as keyof typeof resultTypes];
  const title = `내 배그 플레이 유형은 ${result.name}! 너는 어떤 유형일까?`;
  const images = ["/images/og/og-default.png"];
  return {
    title,
    openGraph: { title, description: "", type: "website", siteName: "PUBG 플레이스타일 테스트", images },
    twitter: { card: "summary_large_image", title, description: "", images },
  };
}

export default function SharePage() {
  // 리디렉션 없이 기존 랜딩을 재사용해 URL의 UTM을 최초 방문 처리에 전달합니다.
  return <LandingContent />;
}
