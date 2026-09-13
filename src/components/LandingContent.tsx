"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/LoadingOverlay";
import { trackEvent } from "@/lib/analytics";
import { getVisitorContext } from "@/lib/visitorContext";

export default function LandingContent() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  useEffect(() => {
    const context = getVisitorContext();
    if (context) trackEvent("landing_view", {}, {
      scope: "sessionStorage", key: `landing:${context.session_id}`,
    });
  }, []);

  return (
    <main lang="ko" className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <LoadingOverlay open={isNavigating} title="테스트 준비 중" description="문항을 준비하고 있어요." />
      <div inert={isNavigating} className="w-full max-w-xl space-y-6 break-keep text-center">
        <h1 className="text-3xl font-extrabold">PUBG 플레이스타일 테스트</h1>
        <p className="text-lg leading-relaxed text-slate-600">평소 게임에서의 선택으로 나의 플레이 성향을 알아보세요.</p>
        <p className="text-slate-600">24개 질문 · 정답은 없어요</p>
        <Link href="/test" aria-disabled={isNavigating} onClick={(event) => {
          if (isNavigating) { event.preventDefault(); return; }
          trackEvent("cta_click");
        }} onNavigate={(event) => {
          event.preventDefault();
          if (!isNavigating) startTransition(() => router.push("/test"));
        }}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">
          테스트 시작하기
        </Link>
      </div>
    </main>
  );
}
