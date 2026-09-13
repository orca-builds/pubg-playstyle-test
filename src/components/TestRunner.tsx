"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QuestionCard from "@/components/QuestionCard";
import { orderedQuestions } from "@/data/questionOrder";
import {
  canGoNext, finishAttempt, isAttemptExpired, moveQuestion,
  restoreAttempt, saveAttempt, selectAnswer, TEST_STORAGE_KEY,
} from "@/lib/testProgress";
import type { InProgressAttempt } from "@/types/testProgress";
import { prepareResultSnapshot } from "@/lib/resultSnapshot";
import {
  hasRetryRequest, trackAnswer, trackBack, trackQuestionView,
  trackRetry, trackTestComplete,
} from "@/lib/testAnalytics";
import { readAttemptCredential } from "@/lib/attemptCredentials";
import { hasPendingDatabaseStart, startDatabaseAttempt } from "@/lib/startDatabaseAttempt";
import { hasUnsyncedAnswers, invalidateAnswerAcknowledgement, syncDatabaseAnswers } from "@/lib/syncDatabaseAnswers";
import { clearPendingCompletion, completeDatabaseAttempt, hasPendingCompletion } from "@/lib/completeDatabaseAttempt";

const buttonClass = "min-h-12 rounded-lg border border-slate-400 px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-40";
const primaryClass = `${buttonClass} border-blue-700 bg-blue-700 text-white hover:bg-blue-800`;

export default function TestRunner() {
  const router = useRouter();
  const [progress, setProgress] = useState<InProgressAttempt | null>(null);
  const [screen, setScreen] = useState<"loading" | "resume" | "questions">("loading");
  const [isNavigating, setIsNavigating] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [needsNewStart, setNeedsNewStart] = useState(false);
  const [answerStatus, setAnswerStatus] = useState<"ready" | "pending" | "saving" | "error">("ready");
  const [completionPending, setCompletionPending] = useState(false);
  const completionDraft = useRef<ReturnType<typeof finishAttempt> | null>(null);
  const answerSaveLock = useRef(false);
  const startLock = useRef(false);
  const mounted = useRef(true);
  const completionLock = useRef(false);
  const restartButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const lastQuestionView = useRef<string | null>(null);

  const startNew = useCallback(async (message = "", isRetry = false) => {
    if (startLock.current || answerSaveLock.current) return;
    startLock.current = true;
    setIsStarting(true);
    setError("");
    try {
      const next = await startDatabaseAttempt(isRetry);
      if (!mounted.current) return;
      setProgress(next);
      setScreen("questions");
      setConfirmRestart(false);
      setError("");
      setNotice(message);
      completionLock.current = false;
      setIsNavigating(false);
      setNeedsNewStart(false);
      setAnswerStatus("ready");
      setCompletionPending(false);
      completionDraft.current = null;
    } catch {
      if (mounted.current) setError("테스트를 시작하지 못했습니다. 연결 상태와 브라우저 저장 공간을 확인한 뒤 다시 시도해주세요.");
    } finally {
      startLock.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, []);

  const initialize = useCallback(() => {
    try {
      const restored = restoreAttempt(window.localStorage.getItem(TEST_STORAGE_KEY));
      setError("");
      if (hasPendingDatabaseStart() || hasRetryRequest()) {
        startNew("", true);
      } else if (restored.kind === "in_progress") {
        if (!readAttemptCredential(window.localStorage, restored.progress)) {
          setProgress(null);
          setScreen("loading");
          setNeedsNewStart(true);
          setError("이전 테스트의 연결 정보를 복구할 수 없습니다. 새 테스트를 시작해주세요.");
          return;
        }
        setProgress(restored.progress);
        const pendingCompletion = hasPendingCompletion(restored.progress);
        setCompletionPending(pendingCompletion);
        setAnswerStatus(!pendingCompletion && hasUnsyncedAnswers(window.localStorage, restored.progress) ? "pending" : "ready");
        // A newly committed start (including result-page retry) opens Q1 directly.
        setScreen(restored.progress.answers.length === 0 && !pendingCompletion ? "questions" : "resume");
      } else {
        const messages = {
          expired: "이전 테스트의 시작 후 24시간이 지나 새 테스트를 시작합니다.",
          version_mismatch: "테스트가 업데이트되어 새 테스트를 시작합니다.",
          order_mismatch: "질문 순서가 변경되어 새 테스트를 시작합니다.",
          invalid: "이전 진행 상태를 복원할 수 없어 새 테스트를 시작합니다.",
          empty: "", completed: "",
        };
        startNew(messages[restored.kind], restored.kind === "completed");
      }
    } catch {
      setError("저장된 진행 상태를 읽지 못했습니다. 브라우저 저장 공간을 허용한 뒤 다시 시도해주세요.");
    }
  }, [startNew]);

  useEffect(() => {
    mounted.current = true;
    // 서버 렌더링에서는 저장소에 접근하지 않습니다. Strict Mode 재실행도 정리합니다.
    let active = true;
    Promise.resolve().then(() => { if (active) initialize(); });
    // 브라우저의 뒤로 가기 캐시에서 복원될 때도 최신 저장 상태를 확인합니다.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) initialize();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      active = false;
      mounted.current = false;
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [initialize]);

  useEffect(() => {
    if (screen === "questions" && !confirmRestart) {
      document.getElementById("question-title")?.focus();
    }
  }, [screen, progress?.currentQuestionIndex, confirmRestart]);

  useEffect(() => {
    const visible = screen === "questions" && !confirmRestart && !isNavigating && !isStarting;
    const viewKey = visible && progress ? `${progress.attemptId}:${progress.currentQuestionIndex}` : null;
    if (viewKey && viewKey !== lastQuestionView.current && progress) {
      trackQuestionView(progress, progress.currentQuestionIndex);
    }
    lastQuestionView.current = viewKey;
  }, [screen, confirmRestart, isNavigating, isStarting, progress]);

  useEffect(() => {
    if (confirmRestart) cancelButton.current?.focus();
  }, [confirmRestart]);

  function ensureFresh() {
    if (startLock.current || answerSaveLock.current) return false;
    if (!progress) return false;
    if (isAttemptExpired(progress.startedAt)) {
      startNew("테스트 시작 후 24시간이 지나 새 테스트를 시작합니다.");
      return false;
    }
    let hasCredential = false;
    try { hasCredential = readAttemptCredential(window.localStorage, progress) !== null; }
    catch { /* Storage access can be revoked after initialization. */ }
    if (!hasCredential) {
      setProgress(null);
      setScreen("loading");
      setNeedsNewStart(true);
      setError("테스트 연결 정보를 복구할 수 없습니다. 새 테스트를 시작해주세요.");
      return false;
    }
    return true;
  }

  function commit(next: InProgressAttempt, changedQuestionId?: string) {
    try {
      // Invalidate before local commit, including when returning to an earlier choice
      // after an ambiguous failed request. Refresh must still require a server save.
      if (changedQuestionId) invalidateAnswerAcknowledgement(window.localStorage, next, changedQuestionId);
      saveAttempt(window.localStorage, next);
      setProgress(next);
      setError("");
      return true;
    } catch {
      if (changedQuestionId) setAnswerStatus("pending");
      // 저장 실패 시 화면도 다음 단계로 넘기지 않아 저장값과 화면을 일치시킵니다.
      setError("진행 상태를 저장하지 못했습니다. 저장 공간을 확인한 뒤 같은 선택이나 이동을 다시 시도해주세요.");
      return false;
    }
  }

  function handleSelect(choiceId: string) {
    if (completionPending) return;
    if (!completionLock.current && progress && ensureFresh()) {
      const next = selectAnswer(progress, choiceId);
      const saved = commit(next, orderedQuestions[progress.currentQuestionIndex].id);
      trackAnswer(progress, choiceId, saved);
      if (saved) void persistAnswers(next);
    }
  }

  async function persistAnswers(next: InProgressAttempt) {
    if (answerSaveLock.current) return;
    answerSaveLock.current = true;
    setAnswerStatus("saving");
    setError("");
    try {
      await syncDatabaseAnswers(next);
      if (mounted.current) setAnswerStatus("ready");
    } catch {
      if (mounted.current) {
        setAnswerStatus("error");
        setError("답변을 서버에 저장하지 못했습니다. 선택은 이 브라우저에 남아 있습니다. 연결 상태를 확인하고 저장을 다시 시도해주세요.");
      }
    } finally {
      answerSaveLock.current = false;
    }
  }

  async function handleNext() {
    if (answerSaveLock.current || answerStatus !== "ready") return;
    if (completionLock.current || !progress || !ensureFresh() || !canGoNext(progress)) return;
    if (progress.currentQuestionIndex < orderedQuestions.length - 1) {
      commit(moveQuestion(progress, 1));
      return;
    }
    completionLock.current = true;
    setIsNavigating(true);
    try {
      const draft = completionDraft.current;
      const sameDraft = draft?.progress.attemptId === progress.attemptId &&
        draft.progress.startedAt === progress.startedAt &&
        JSON.stringify(draft.progress.answers) === JSON.stringify(progress.answers);
      const completed = sameDraft ? draft : finishAttempt(progress);
      completionDraft.current = completed;
      setCompletionPending(true);
      const completion = await completeDatabaseAttempt(progress, completed.result);
      if (!mounted.current) return;
      // DB completion must succeed before local completion, Analytics, and navigation.
      saveAttempt(window.localStorage, completed.progress);
      prepareResultSnapshot(completed.progress, completed.result);
      trackTestComplete(completed.progress, completed.result, completion);
      // A stale pending marker is harmless once progress is completed; cleanup is best effort.
      try { clearPendingCompletion(progress.attemptId); } catch { /* Browser storage can be revoked. */ }
      setIsNavigating(true);
      setError("");
      router.push("/result");
    } catch {
      completionLock.current = false;
      if (mounted.current) {
        setIsNavigating(false);
        setError("완료 상태를 저장하지 못했습니다. 답변과 계산된 결과는 유지됩니다. 연결 상태와 저장 공간을 확인하고 결과 보기를 다시 눌러주세요.");
      }
    }
  }

  const total = orderedQuestions.length;
  const question = progress ? orderedQuestions[progress.currentQuestionIndex] : null;
  const selected = progress?.answers.find((answer) => answer.questionId === question?.id)?.choiceId;

  return (
    <main lang="ko" className="flex min-h-dvh flex-col bg-slate-50 px-4 pt-6 text-slate-950 sm:pt-10">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold">PUBG 플레이스타일 테스트</h1>
          <p className="break-keep leading-relaxed text-slate-600 [overflow-wrap:anywhere]">정답은 없습니다.<br />잘하는 플레이보다 평소 실제 게임에서 내가 더 자주 하는 선택을 골라주세요.</p>
        </header>

        {notice && <p role="status" className="rounded-lg border border-slate-300 bg-white p-4 leading-relaxed">{notice}</p>}
        {isStarting && <p role="status">테스트를 시작하고 있습니다.</p>}

        {confirmRestart ? (
          <section aria-labelledby="restart-title" className="space-y-5 rounded-xl border border-slate-300 bg-white p-5">
            <h2 id="restart-title" className="text-xl font-bold">테스트를 처음부터 다시 시작할까요?</h2>
            <p>현재 선택한 답변은 초기화됩니다.</p>
            <div className="grid grid-cols-2 gap-3">
              <button ref={cancelButton} disabled={isStarting} type="button" className={buttonClass} onClick={() => {
                setConfirmRestart(false);
                requestAnimationFrame(() => restartButton.current?.focus());
              }}>취소</button>
              <button type="button" disabled={isStarting} className={primaryClass} onClick={() => {
                if (startLock.current) return;
                if (progress) trackRetry(progress);
                startNew("", true);
              }}>다시 시작</button>
            </div>
          </section>
        ) : screen === "loading" ? (
          !error && !isStarting && <p role="status">진행 상태를 확인하고 있습니다.</p>
        ) : screen === "resume" && progress ? (
          <section className="space-y-5 rounded-xl border border-slate-300 bg-white p-5">
            <h2 className="text-xl font-bold">진행 중인 테스트가 있습니다.</h2>
            <p>{progress.answers.length} / {total} 문항에 답변했습니다. {progress.currentQuestionIndex + 1}번 문항부터 이어갑니다.</p>
            <button type="button" disabled={isStarting || answerStatus === "saving"} className={`${primaryClass} w-full`} onClick={() => {
              if (ensureFresh()) {
                setScreen("questions");
                if (answerStatus !== "ready") void persistAnswers(progress);
              }
            }}>이어서 하기</button>
          </section>
        ) : progress && question ? (
          <>
            <div className="space-y-2">
              <p aria-live="polite" className="font-semibold">문항 {progress.currentQuestionIndex + 1} / {total}</p>
              <progress aria-label="답변 완료 진행률" value={progress.answers.length} max={total} className="h-3 w-full accent-blue-700" />
              <p className="text-sm text-slate-600">{progress.answers.length}개 답변 완료</p>
            </div>
            <fieldset aria-busy={answerStatus === "saving"} disabled={isNavigating || isStarting || answerStatus === "saving" || completionPending} className="pb-8">
              <QuestionCard question={question} displayOrder={progress.choiceDisplayOrder} selectedChoiceId={selected} onSelect={handleSelect} />
            </fieldset>
          </>
        ) : null}

        {/* Keep save feedback below the question so its appearance cannot push the choices down. */}
        {(error || ((answerStatus === "pending" || answerStatus === "error") && progress)) && (
          <div className="space-y-3">
            {error && <div role="alert" className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 leading-relaxed">
              <p>{error}</p>
              {!progress && <button type="button" disabled={isStarting} className={buttonClass} onClick={() => {
                if (needsNewStart) void startNew();
                else initialize();
              }}>{needsNewStart ? "새 테스트 시작" : "다시 시도"}</button>}
            </div>}
            {(answerStatus === "pending" || answerStatus === "error") && progress && (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p>서버 저장이 완료되면 다음 문항으로 이동할 수 있습니다.</p>
                <button type="button" className={buttonClass} disabled={isStarting} onClick={() => {
                  if (progress && ensureFresh()) void persistAnswers(progress);
                }}>답변 저장 다시 시도</button>
              </div>
            )}
          </div>
        )}

        {progress && !confirmRestart && (
          <footer className="sticky bottom-0 z-10 -mx-4 mt-auto space-y-2 border-t border-slate-200 bg-slate-50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {screen === "questions" && (
              <nav aria-label="문항 이동" className="grid grid-cols-2 gap-3">
                <button type="button" className={buttonClass} disabled={isNavigating || isStarting || completionPending || answerStatus !== "ready" || progress.currentQuestionIndex === 0} onClick={() => {
                  if (!completionPending && !completionLock.current && answerStatus === "ready" && ensureFresh()) {
                    const next = moveQuestion(progress, -1);
                    if (commit(next)) trackBack(progress, next.currentQuestionIndex);
                  }
                }}>이전</button>
                <button type="button" className={primaryClass} disabled={isNavigating || isStarting || answerStatus !== "ready" || !canGoNext(progress)} onClick={handleNext}>
                  {progress.currentQuestionIndex === total - 1 ? (isNavigating ? "완료 저장 중…" : "결과 보기") : "다음"}
                </button>
              </nav>
            )}
            <button ref={restartButton} disabled={isNavigating || isStarting || answerStatus === "saving"} type="button" className="min-h-11 w-full rounded-lg px-4 py-2 text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700" onClick={() => {
              if (!answerSaveLock.current) setConfirmRestart(true);
            }}>
              처음부터 다시하기
            </button>
          </footer>
        )}
      </div>
    </main>
  );
}
