import type { Question } from "@/types/test";
import { getDisplayedChoices, type ChoiceDisplayOrder } from "@/lib/choiceDisplayOrder";

type Props = {
  question: Question;
  selectedChoiceId?: string;
  onSelect: (choiceId: string) => void;
  displayOrder?: ChoiceDisplayOrder;
};

export default function QuestionCard({ question, selectedChoiceId, onSelect, displayOrder }: Props) {
  return (
    <section aria-labelledby="question-title" className="space-y-4">
      <h2 id="question-title" tabIndex={-1} className="break-keep text-lg leading-7 font-bold [overflow-wrap:anywhere] outline-none sm:text-xl sm:leading-8">
        {question.text}
      </h2>
      <div className="grid gap-3" role="group" aria-labelledby="question-title">
        {getDisplayedChoices(question, displayOrder).map((choice, index) => {
          const selected = choice.id === selectedChoiceId;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(choice.id)}
              className={`flex min-h-16 w-full scroll-mb-6 items-start gap-2 rounded-xl border-2 p-3 text-left text-base leading-6 transition-[scale,background-color,border-color] duration-150 motion-safe:active:scale-[0.99] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:gap-3 sm:p-4 ${
                selected ? "border-blue-700 bg-blue-50" : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100"
              }`}
            >
              <span aria-hidden="true" className="w-6 shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
              <span className="min-w-0 flex-1 break-keep [overflow-wrap:anywhere]">{choice.text}</span>
              {/* 선택 전에도 체크 영역의 폭과 높이를 확보합니다. */}
              <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center font-bold text-blue-700">
                <span className={selected ? "visible" : "invisible"}>✓</span>
              </span>
              {selected && <span className="sr-only">✓ 선택됨</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
