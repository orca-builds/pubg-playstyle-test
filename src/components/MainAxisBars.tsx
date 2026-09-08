import type { MainScores } from "@/lib/scoring";
import type { MainTrait } from "@/types/test";

// 표시 이름만 정의합니다. 퍼센트는 scoring 결과를 그대로 사용합니다.
const axes = [
  { first: "combat", second: "position", firstLabel: "교전", secondLabel: "포지션" },
  { first: "frontline", second: "support", firstLabel: "선봉", secondLabel: "서포트" },
  { first: "pressure", second: "design", firstLabel: "직접 압박", secondLabel: "전투 설계" },
  { first: "risk", second: "safe", firstLabel: "리스크", secondLabel: "안정" },
] as const satisfies readonly {
  first: MainTrait; second: MainTrait; firstLabel: string; secondLabel: string;
}[];

export default function MainAxisBars({ percentages }: { percentages: MainScores }) {
  return (
    <section aria-labelledby="main-axes-title" className="space-y-6 border-t border-slate-200 pt-7">
      <div className="space-y-1">
        <h3 id="main-axes-title" className="text-lg font-bold">나의 플레이 성향</h3>
        <p className="text-sm leading-relaxed text-slate-600">각 축의 두 성향이 차지하는 비율입니다.</p>
      </div>
      <ul className="space-y-7">
        {axes.map((axis) => (
          <li key={axis.first} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm font-semibold sm:text-base">
              <p className="min-w-0 text-blue-800">{`${axis.firstLabel} ${percentages[axis.first]}%`}</p>
              <p className="min-w-0 text-right text-amber-800">{`${axis.secondLabel} ${percentages[axis.second]}%`}</p>
            </div>
            {/* 수치는 위의 텍스트로 전달하고, 이 막대는 시각적 보조로 사용합니다. */}
            <div aria-hidden="true" className="h-3">
              <div className="flex h-full w-full overflow-hidden rounded-full bg-slate-100">
                <span className="h-full shrink-0 bg-blue-600" style={{ width: `${percentages[axis.first]}%` }} />
                <span className="h-full shrink-0 bg-amber-400" style={{ width: `${percentages[axis.second]}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
