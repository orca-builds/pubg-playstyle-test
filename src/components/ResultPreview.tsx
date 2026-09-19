"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import ResultContent from "@/components/ResultContent";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  getResultSnapshot, getServerResultSnapshot, retryResultSnapshot, subscribeToResult,
} from "@/lib/resultSnapshot";
import { trackEvent } from "@/lib/analytics";
import { trackRetry } from "@/lib/testAnalytics";
import { startDatabaseAttempt } from "@/lib/startDatabaseAttempt";
import type { ResultSnapshot } from "@/lib/resultSnapshot";
import { shareResult, type ShareOutcome } from "@/lib/shareResult";

export default function ResultPreview() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeToResult, getResultSnapshot, getServerResultSnapshot);
  const lastView = useRef<string | null>(null);
  const retrying = useRef(false);
  const sharing = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [previousResult, setPreviousResult] = useState<ResultSnapshot | null>(null);

  useEffect(() => {
    const restoreView = () => {
      if (window.location.pathname !== "/result") return;
      retrying.current = false;
      sharing.current = false;
      setIsStarting(false);
      setIsSharing(false);
      setPreviousResult(null);
      setStartError("");
    };
    window.addEventListener("pageshow", restoreView);
    window.addEventListener("popstate", restoreView);
    return () => {
      window.removeEventListener("pageshow", restoreView);
      window.removeEventListener("popstate", restoreView);
    };
  }, []);

  async function handleShare() {
    if (sharing.current || retrying.current) return;
    const displayed = previousResult ?? snapshot;
    if (displayed.status !== "ready") return;
    sharing.current = true;
    setIsSharing(true);
    setShareOutcome(null);
    try {
      setShareOutcome(await shareResult({
        attemptId: displayed.attemptId, testVersion: displayed.result.testVersion,
        mainType: displayed.result.mainResult.id, typeName: displayed.result.mainResult.name,
      }));
    } catch {
      setShareOutcome("error");
    } finally {
      sharing.current = false;
      setIsSharing(false);
    }
  }

  async function handleStartTest() {
    if (retrying.current || sharing.current) return;
    retrying.current = true;
    setPreviousResult(snapshot);
    setIsStarting(true);
    setStartError("");
    if (snapshot.status === "ready") {
      trackRetry({ attemptId: snapshot.attemptId, testVersion: snapshot.result.testVersion });
    }
    try {
      await startDatabaseAttempt(snapshot.status === "ready");
      // Keep the completed result visible until navigation, even after storage changes.
      router.push("/test");
    } catch {
      retrying.current = false;
      setIsStarting(false);
      setStartError("새 테스트를 시작하지 못했습니다. 기존 결과는 유지됩니다. 연결 상태와 저장 공간을 확인하고 다시 시도해주세요.");
    }
  }

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
      <LoadingOverlay open={isStarting} failed={Boolean(startError)} title="테스트 준비 중" description="문항을 준비하고 있어요." />
      <div inert={isStarting} className="mx-auto w-full max-w-xl break-keep [overflow-wrap:anywhere]">
        <h1 className="sr-only">테스트 결과</h1>
        <ResultContent
          snapshot={previousResult ?? snapshot}
          onStartTest={handleStartTest}
          isStarting={isStarting}
          startError={startError}
          onShare={handleShare}
          isSharing={isSharing}
          shareOutcome={shareOutcome}
          onRetryLoad={retryResultSnapshot}
        />
      </div>
    </main>
  );
}
