import Image from "next/image";
import MainAxisBars from "@/components/MainAxisBars";
import type { ResultSnapshot } from "@/lib/resultSnapshot";

type Props = {
  snapshot: ResultSnapshot;
  onStartTest: () => void;
  onRetryLoad: () => void;
};

const buttonClass = "min-h-12 w-full rounded-xl px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700";

export default function ResultContent({ snapshot, onStartTest, onRetryLoad }: Props) {
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
    <article className="space-y-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p className="text-center text-sm font-semibold tracking-wide text-slate-600">당신의 배그 플레이 유형은</p>

      <div className="mx-auto flex aspect-square w-full max-w-48 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 sm:max-w-56">
        {mainResult.imageSrc !== null ? (
          <Image src={mainResult.imageSrc} alt={mainResult.imageAlt} width={224} height={224} className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-5 text-slate-500">
            <svg aria-hidden="true" viewBox="0 0 100 100" className="size-24 text-slate-300" fill="currentColor">
              <circle cx="50" cy="30" r="18" />
              <path d="M16 90v-8a34 34 0 0 1 68 0v8Z" />
            </svg>
            <span className="text-sm">캐릭터 이미지 준비 중</span>
          </div>
        )}
      </div>

      <div className="space-y-4 text-center">
        <h2 className="text-3xl leading-snug font-extrabold text-slate-950 sm:text-4xl">{mainResult.name}</h2>
        <ul aria-label="보조 성향 태그" className="flex flex-wrap justify-center gap-2">
          {displaySubTags.map((tag) => (
            <li key={tag} className="max-w-full rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800">{tag}</li>
          ))}
        </ul>
        <p className="text-lg leading-relaxed font-semibold text-slate-800">{mainResult.summary}</p>
      </div>

      <p className="whitespace-pre-line leading-7 text-slate-600">{mainResult.description}</p>
      <MainAxisBars percentages={mainPercentages} />

      <div className="space-y-3 border-t border-slate-200 pt-6">
        <button type="button" disabled aria-describedby="share-note" className={`${buttonClass} cursor-not-allowed bg-slate-200 text-slate-500`}>공유하기</button>
        <p id="share-note" className="text-center text-sm text-slate-500">공유 기능은 준비 중입니다.</p>
        <button type="button" onClick={onStartTest} className={`${buttonClass} border border-blue-700 text-blue-800 hover:bg-blue-50`}>다시 하기</button>
      </div>
    </article>
  );
}
