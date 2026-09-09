"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { getVisitorContext } from "@/lib/visitorContext";

export default function LandingContent() {
  useEffect(() => {
    const context = getVisitorContext();
    if (context) trackEvent("landing_view", {}, {
      scope: "sessionStorage", key: `landing:${context.session_id}`,
    });
  }, []);

  return (
    <main lang="ko" className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <div className="w-full max-w-xl space-y-6 break-keep text-center">
        <h1 className="text-3xl font-extrabold">PUBG 플레이스타일 테스트</h1>
        <p className="text-lg leading-relaxed text-slate-600">평소 게임에서의 선택으로 나의 플레이 성향을 알아보세요.</p>
        <p className="text-slate-600">24개 질문 · 정답은 없어요</p>
        <Link href="/test" onClick={() => { trackEvent("cta_click"); }}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">
          테스트 시작하기
        </Link>
      </div>
    </main>
  );
}
