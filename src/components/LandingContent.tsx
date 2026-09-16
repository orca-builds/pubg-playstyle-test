"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/LoadingOverlay";
import { trackEvent } from "@/lib/analytics";
import { getVisitorContext } from "@/lib/visitorContext";

const testMeta = ["24개 질문", "정답은 없어요"];

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
    <main lang="ko" className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8 text-slate-950 sm:px-6 sm:py-16">
      <LoadingOverlay open={isNavigating} title="테스트 준비 중" description="문항을 준비하고 있어요." />
      <div inert={isNavigating} className="w-full max-w-2xl space-y-6 break-keep text-center sm:space-y-8">
        <header className="space-y-4 sm:space-y-6">
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl lg:text-5xl">PUBG 플레이스타일 테스트</h1>
          <div className="mx-auto max-w-lg space-y-2 sm:space-y-3">
            <p className="text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">평소 게임에서의 선택으로 나의 플레이 성향을 알아보세요.</p>
            <p className="text-sm leading-6 font-medium text-slate-800 sm:text-base">16가지 플레이 유형 중 나는 어떤 유형일까?</p>
          </div>
        </header>
        <p className="text-sm leading-6 text-slate-500">{testMeta.join(" · ")}</p>
        <Link href="/test" aria-disabled={isNavigating} onClick={(event) => {
          if (isNavigating) { event.preventDefault(); return; }
          trackEvent("cta_click");
        }} onNavigate={(event) => {
          event.preventDefault();
          if (!isNavigating) startTransition(() => router.push("/test"));
        }}
          className="mx-auto flex min-h-12 w-full max-w-md items-center justify-center whitespace-nowrap rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white transition-[scale,background-color] duration-150 ease-out hover:bg-blue-800 motion-safe:hover:scale-[1.015] motion-safe:active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 sm:min-h-14 sm:text-lg">
          내 플레이 유형 확인하기
        </Link>
      </div>
    </main>
  );
}
