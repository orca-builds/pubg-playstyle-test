import ResultCharacter from "@/components/ResultCharacter";
import MainAxisBars from "@/components/MainAxisBars";
import { supportTagDescriptions } from "@/data/supportTagDescriptions";
import { observeShareAttention } from "@/lib/observeShareAttention";
import type { ResultSnapshot } from "@/lib/resultSnapshot";
import { SHARE_BUTTON_LABEL, SHARE_ERROR, type ShareOutcome } from "@/lib/shareResult";

type Props = {
  snapshot: ResultSnapshot;
  onStartTest: () => void;
  onRetryLoad: () => void;
  isStarting?: boolean;
  startError?: string;
  onShare: () => void;
  isSharing?: boolean;
  shareOutcome?: ShareOutcome | null;
};

const buttonClass = "min-h-12 w-full rounded-xl px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700";

export default function ResultContent({ snapshot, onStartTest, onRetryLoad, isStarting = false, startError = "", onShare, isSharing = false, shareOutcome = null }: Props) {
  // 저장값을 확인하기 전에는 결과 없음이나 짧은 loading 화면을 표시하지 않습니다.
  if (snapshot.status === "initializing") return null;

  if (snapshot.status !== "ready") {
    const missing = snapshot.status === "missing";
    return (
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h2 className="text-xl font-bold">{missing ? "아직 완료된 테스트 결과가 없습니다." : "결과를 불러오지 못했습니다."}</h2>
        {!missing && <p role="alert" className="leading-relaxed text-slate-600">
          {snapshot.status === "error" ? "브라우저 저장 공간을 확인하거나 테스트를 다시 진행해주세요." : "저장된 결과가 유효하지 않습니다. 테스트를 다시 진행해주세요."}
        </p>}
        <button type="button" onClick={onStartTest} className={`${buttonClass} bg-blue-700 text-white hover:bg-blue-800`}>
          {missing ? "테스트 시작하기" : "테스트 다시 시작"}
        </button>
        {snapshot.status === "error" && <button type="button" onClick={onRetryLoad} className={`${buttonClass} border border-slate-300 text-slate-700`}>결과 다시 불러오기</button>}
      </section>
    );
  }

  const { mainResult, mainPercentages, displaySubTags } = snapshot.result;
  return (
    <article className="space-y-6 rounded-2xl border border-slate-200 bg-white px-3 py-6 shadow-sm min-[375px]:px-5 sm:p-8">
      <header className="space-y-2 text-center">
        <p className="text-sm font-semibold tracking-wide text-slate-600">당신의 배그 플레이 유형은</p>
        <h2 className="text-3xl leading-snug font-extrabold text-slate-950 sm:text-4xl">{mainResult.name}</h2>
      </header>

      <ResultCharacter key={`${snapshot.attemptId}:${mainResult.id}`} src={mainResult.imageSrc} name={mainResult.name} />
      <div className="space-y-2 text-left">
        <p className="text-base leading-7 font-semibold text-slate-800">{mainResult.summary}</p>
        <p className="whitespace-normal text-base leading-7 text-slate-600 [overflow-wrap:anywhere]">{mainResult.description}</p>
      </div>
      <section aria-labelledby="support-traits-title" className="space-y-3 border-t border-slate-200 pt-5">
        <h3 id="support-traits-title" className="text-lg font-bold">세부 플레이 성향</h3>
        <ul aria-label="보조 성향 태그" className="grid auto-rows-fr items-stretch gap-3 sm:grid-cols-2">
          {displaySubTags.map((tag) => (
            <li key={tag} className="flex h-full min-h-[108px] min-w-0 flex-col items-start gap-2 rounded-xl bg-slate-50 p-3">
              <span className="max-w-full shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-sm leading-5 font-semibold text-blue-800">{tag}</span>
              <p className="w-full px-2.5 text-left text-sm leading-6 text-slate-600">{supportTagDescriptions[tag]}</p>
            </li>
          ))}
        </ul>
      </section>
      <MainAxisBars percentages={mainPercentages} />

      <div className="space-y-3 border-t border-slate-200 pt-5">
        <button ref={observeShareAttention} type="button" onClick={onShare} disabled={isSharing} aria-busy={isSharing} aria-describedby="share-note" className={`${buttonClass} result-share-attention inline-flex items-center justify-center gap-2 bg-blue-700 text-base leading-5 text-white shadow-sm transition-[scale,box-shadow,background-color] duration-200 ease-out enabled:hover:bg-blue-800 enabled:hover:shadow-md motion-safe:enabled:hover:scale-[1.02] motion-safe:enabled:active:scale-[0.98] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50`}>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="block size-5 shrink-0">
            <path d="m8.5 10.5 7-4m-7 7 7 4" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="5" r="3" />
            <circle cx="18" cy="19" r="3" />
          </svg>
          <span className="whitespace-nowrap leading-5">{SHARE_BUTTON_LABEL}</span>
        </button>
        <p id="share-note" role={shareOutcome === "error" ? "alert" : "status"} className="min-h-5 text-center text-sm text-slate-600">
          {shareOutcome === "copied" ? "복사했어요" : shareOutcome === "error" ? SHARE_ERROR : "친구와 결과를 비교해보세요"}
        </p>
        <button type="button" onClick={onStartTest} disabled={isStarting || isSharing} aria-busy={isStarting} className="min-h-11 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {startError ? "다시 하기 재시도" : "다시 하기"}
        </button>
        {startError && <p role="alert" className="text-sm leading-relaxed text-red-700">{startError}</p>}
      </div>
    </article>
  );
}
