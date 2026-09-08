"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ResultContent from "@/components/ResultContent";
import {
  getResultSnapshot, getServerResultSnapshot, retryResultSnapshot, subscribeToResult,
} from "@/lib/resultSnapshot";

export default function ResultPreview() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeToResult, getResultSnapshot, getServerResultSnapshot);

  return (
    <main lang="ko" className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950 sm:py-12">
      <div className="mx-auto w-full max-w-xl break-keep [overflow-wrap:anywhere]">
        <h1 className="sr-only">테스트 결과</h1>
        <ResultContent
          snapshot={snapshot}
          onStartTest={() => router.push("/test")}
          onRetryLoad={retryResultSnapshot}
        />
      </div>
    </main>
  );
}
