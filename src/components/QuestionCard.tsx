import type { Question } from "@/types/test";

type Props = {
  question: Question;
  selectedChoiceId?: string;
  onSelect: (choiceId: string) => void;
};

export default function QuestionCard({ question, selectedChoiceId, onSelect }: Props) {
  return (
    <section aria-labelledby="question-title" className="space-y-6">
      <h2 id="question-title" tabIndex={-1} className="break-keep text-xl leading-relaxed font-semibold [overflow-wrap:anywhere] outline-none sm:text-2xl">
        {question.text}
      </h2>
      <div className="grid gap-3" role="group" aria-labelledby="question-title">
        {question.choices.map((choice, index) => {
          const selected = choice.id === selectedChoiceId;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(choice.id)}
              className={`flex min-h-20 w-full scroll-mb-44 items-start gap-3 rounded-xl border-2 p-4 text-left leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 ${
                selected ? "border-blue-700 bg-blue-50" : "border-slate-300 bg-white hover:border-slate-500"
              }`}
            >
              <span aria-hidden="true" className="shrink-0 font-bold">{String.fromCharCode(65 + index)}.</span>
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
