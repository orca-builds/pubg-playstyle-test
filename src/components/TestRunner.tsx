"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QuestionCard from "@/components/QuestionCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { loadingTiming } from "@/lib/loadingTiming";
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
const navigationClass = "min-h-11 rounded-lg border px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500";

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
  const [isRestarting, setIsRestarting] = useState(false);
  const restartLock = useRef(false);
  const completionDraft = useRef<ReturnType<typeof finishAttempt> | null>(null);
  const activeAttempt = useRef<string | null>(null);
  const startLock = useRef(false);
  const mounted = useRef(true);
  const completionLock = useRef(false);
  const restartButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const lastQuestionView = useRef<string | null>(null);

  const startNew = useCallback(async (message = "", isRetry = false) => {
    if (startLock.current) return;
    startLock.current = true;
    setIsStarting(true);
    setError("");
    try {
      const next = await startDatabaseAttempt(isRetry);
      if (!mounted.current) return;
      activeAttempt.current = next.attemptId;
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
        activeAttempt.current = restored.progress.attemptId;
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
    if (startLock.current || restartLock.current) return false;
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
    if (!progress) return;
    const questionId = orderedQuestions[progress.currentQuestionIndex].id;
    const currentAnswerId = progress.answers.find(answer => answer.questionId === questionId)?.choiceId;
    // 이미 선택한 내부 ID는 저장, Analytics, queue를 모두 건너뜁니다.
    if (currentAnswerId === choiceId) return;
    if (completionPending) return;
    if (!completionLock.current && progress && ensureFresh()) {
      const answered = selectAnswer(progress, choiceId);
      const saved = commit(answered, orderedQuestions[progress.currentQuestionIndex].id);
      trackAnswer(progress, choiceId, saved);
      if (saved) void persistAnswers(answered);
    }
  }

  async function persistAnswers(next: InProgressAttempt, retry = false) {
    setAnswerStatus("saving");
    try {
      await syncDatabaseAnswers(next, retry);
      if (mounted.current && activeAttempt.current === next.attemptId) setAnswerStatus("ready");
      return true;
    } catch {
      if (mounted.current && activeAttempt.current === next.attemptId) {
        setAnswerStatus("error");
      }
      return false;
    }
  }

  async function handleRestart() {
    if (restartLock.current || startLock.current || completionLock.current || !progress) return;
    restartLock.current = true;
    setIsRestarting(true);
    setError("");
    try {
      // Freeze the current snapshot before draining; keep its credential until success.
      if (!commit(progress)) return;
      // An ambiguous complete response may mean the attempt is already completed.
      // That flow drained all answers first, so never write to it again.
      if (completionPending) {
        if (hasUnsyncedAnswers(window.localStorage, progress)) throw new Error("ANSWER_SAVE_FAILED");
      } else if (!await persistAnswers(progress, true)) {
        throw new Error("ANSWER_SAVE_FAILED");
      }
      if (!mounted.current || activeAttempt.current !== progress.attemptId) return;
      trackRetry(progress);
      await startNew("", true);
    } catch {
      if (mounted.current) setError("답변을 저장하지 못해 다시 시작하지 않았습니다. 기존 답변은 유지됩니다. 연결 상태를 확인한 뒤 다시 시작을 눌러주세요.");
    } finally {
      restartLock.current = false;
      if (mounted.current) setIsRestarting(false);
    }
  }

  async function handleNext() {
    if (completionLock.current || !progress || !ensureFresh() || !canGoNext(progress)) return;
    if (progress.currentQuestionIndex < orderedQuestions.length - 1) {
      commit(moveQuestion(progress, 1));
      return;
    }
    completionLock.current = true;
    setIsNavigating(true);
    try {
      // A previous complete request may already have committed on the server.
      // Its retry must not write answers to a potentially completed attempt.
      if (!completionPending && !await persistAnswers(progress, true)) {
        completionLock.current = false;
        if (mounted.current) setIsNavigating(false);
        return;
      }
      if (!mounted.current || activeAttempt.current !== progress.attemptId) return;
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
      if (!await loadingTiming.waitForMinimum() || !mounted.current) return;
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
  const loadingOpen = isStarting || isNavigating || (screen === "loading" && !error && !needsNewStart);

  return (
    <main lang="ko" className="flex h-dvh flex-col overflow-hidden bg-slate-50 px-4 text-slate-950">
      <LoadingOverlay open={loadingOpen} failed={!loadingOpen && (Boolean(error) || answerStatus === "error")} title={isNavigating ? "결과 생성 중" : "테스트 준비 중"}
        description={isNavigating ? "플레이스타일을 정리하고 있어요." : "문항을 준비하고 있어요."} />
      <div inert={loadingOpen} className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain px-1 pt-4 pb-6 sm:pt-6">
        <header className="space-y-1.5">
          <h1 className="text-lg font-bold sm:text-xl">PUBG 플레이스타일 테스트</h1>
          <p className="break-keep text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">평소 실제 플레이에 가까운 선택을 골라주세요.</p>
          {progress?.currentQuestionIndex === 0 && <p className="text-xs leading-5 text-slate-500">정답은 없습니다.</p>}
        </header>

        {notice && progress?.answers.length === 0 && <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm leading-5 text-blue-800">{notice}</p>}

        {confirmRestart ? (
          <section aria-labelledby="restart-title" className="space-y-5 rounded-xl border border-slate-300 bg-white p-5">
            <h2 id="restart-title" className="text-xl font-bold">테스트를 처음부터 다시 시작할까요?</h2>
            <p>현재 선택한 답변은 초기화됩니다.</p>
            <div className="grid grid-cols-2 gap-3">
              <button ref={cancelButton} disabled={isStarting || isRestarting} type="button" className={buttonClass} onClick={() => {
                setConfirmRestart(false);
                requestAnimationFrame(() => restartButton.current?.focus());
              }}>취소</button>
              <button type="button" disabled={isStarting || isRestarting} aria-busy={isRestarting} className={primaryClass} onClick={() => void handleRestart()}>
                {isRestarting ? "다시 시작하는 중..." : "다시 시작"}
              </button>
            </div>
          </section>
        ) : screen === "loading" ? (
          null
        ) : screen === "resume" && progress ? (
          <section className="space-y-5 rounded-xl border border-slate-300 bg-white p-5">
            <h2 className="text-xl font-bold">진행 중인 테스트가 있습니다.</h2>
            <p>{progress.answers.length} / {total} 문항에 답변했습니다. {progress.currentQuestionIndex + 1}번 문항부터 이어갑니다.</p>
            <button type="button" disabled={isStarting} className={`${primaryClass} w-full`} onClick={() => {
              if (ensureFresh()) {
                setScreen("questions");
                if (!completionPending) void persistAnswers(progress, true);
              }
            }}>이어서 하기</button>
          </section>
        ) : progress && question ? (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm" aria-live="polite">
                <p className="font-semibold">문항 {progress.currentQuestionIndex + 1} / {total}</p>
                <p className="text-slate-600">{progress.answers.length}개 완료</p>
              </div>
              <progress aria-label="답변 완료 진행률" value={progress.answers.length} max={total} className="block h-2 w-full accent-blue-700" />
            </div>
            <fieldset disabled={isNavigating || isStarting || completionPending} className="min-w-0">
              <QuestionCard question={question} displayOrder={progress.choiceDisplayOrder} selectedChoiceId={selected} onSelect={handleSelect} />
            </fieldset>
          </>
        ) : null}

        {/* Keep save feedback below the question so its appearance cannot push the choices down. */}
        {(error || (answerStatus === "error" && progress)) && (
          <div className="space-y-3">
            {error && <div role="alert" className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 leading-relaxed">
              <p>{error}</p>
              {!progress && <button type="button" disabled={isStarting} className={buttonClass} onClick={() => {
                if (needsNewStart) void startNew();
                else initialize();
              }}>{needsNewStart ? "새 테스트 시작" : "다시 시도"}</button>}
            </div>}
            {answerStatus === "error" && progress && (
              <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <p>답변을 서버에 저장하지 못했습니다. 선택은 이 브라우저에 남아 있어 계속 진행할 수 있습니다. 결과를 보려면 연결 상태를 확인하고 저장을 다시 시도해주세요.</p>
                <button type="button" className={buttonClass} disabled={isStarting || isNavigating || isRestarting} onClick={() => {
                  if (progress && ensureFresh()) void persistAnswers(progress, true);
                }}>답변 저장 다시 시도</button>
              </div>
            )}
          </div>
        )}

        </div>

        {progress && !confirmRestart && (
          <footer className="z-10 -mx-4 shrink-0 space-y-1 border-t border-slate-200 bg-slate-50 px-4 pt-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {screen === "questions" && (
              <nav aria-label="문항 이동" className="grid grid-cols-2 gap-3">
                <button type="button" className={`${navigationClass} border-slate-300 bg-white text-slate-700 enabled:hover:bg-slate-100`} disabled={isNavigating || isStarting || completionPending || progress.currentQuestionIndex === 0} onClick={() => {
                  if (!completionPending && !completionLock.current && ensureFresh()) {
                    const next = moveQuestion(progress, -1);
                    if (commit(next)) trackBack(progress, next.currentQuestionIndex);
                  }
                }}>이전</button>
                <button type="button" className={`${navigationClass} border-blue-700 bg-blue-700 text-white enabled:hover:bg-blue-800`} disabled={isNavigating || isStarting || !canGoNext(progress)} onClick={() => void handleNext()}>
                  {progress.currentQuestionIndex === total - 1 ? "결과 보기" : "다음"}
                </button>
              </nav>
            )}
            <button ref={restartButton} disabled={isNavigating || isStarting} type="button" className="min-h-11 w-full rounded-lg px-4 py-2 text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700" onClick={() => {
              setConfirmRestart(true);
            }}>
              처음부터 다시하기
            </button>
          </footer>
        )}
      </div>
    </main>
  );
}
