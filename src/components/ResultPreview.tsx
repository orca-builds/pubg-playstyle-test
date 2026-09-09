"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ResultContent from "@/components/ResultContent";
import {
  getResultSnapshot, getServerResultSnapshot, retryResultSnapshot, subscribeToResult,
} from "@/lib/resultSnapshot";
import { trackEvent } from "@/lib/analytics";
import { trackRetry } from "@/lib/testAnalytics";

export default function ResultPreview() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeToResult, getResultSnapshot, getServerResultSnapshot);
  const lastView = useRef<string | null>(null);
  const retrying = useRef(false);

  useEffect(() => {
    if (snapshot.status !== "ready") {
      lastView.current = null;
      return;
    }
    if (lastView.current === snapshot.attemptId) return;
    lastView.current = snapshot.attemptId;
    trackEvent("result_view", {
      attempt_id: snapshot.attemptId, test_version: snapshot.result.testVersion,
      main_type: snapshot.result.mainResult.id,
    });
  }, [snapshot]);

  return (
    <main lang="ko" className="min-h-dvh bg-slate-50 px-4 py-8 text-slate-950 sm:py-12">
      <div className="mx-auto w-full max-w-xl break-keep [overflow-wrap:anywhere]">
        <h1 className="sr-only">테스트 결과</h1>
        <ResultContent
          snapshot={snapshot}
          onStartTest={() => {
            if (retrying.current) return;
            retrying.current = true;
            if (snapshot.status === "ready") {
              trackRetry({ attemptId: snapshot.attemptId, testVersion: snapshot.result.testVersion }, true);
            }
            router.push("/test");
          }}
          onRetryLoad={retryResultSnapshot}
        />
      </div>
    </main>
  );
}
