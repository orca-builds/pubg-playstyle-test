import { questionSet } from "@/data/questions";
import type { Question } from "@/types/test";

// 화면의 1~24번 순서입니다. 원본의 관리용 질문 ID와 구분합니다.
export const QUESTION_ORDER = [
  "q01", "q16", "q06", "q11", "q21", "q02",
  "q07", "q17", "q12", "q22", "q03", "q18",
  "q08", "q13", "q23", "q04", "q09", "q19",
  "q14", "q24", "q05", "q20", "q10", "q15",
] as const satisfies readonly (typeof questionSet.questions)[number]["id"][];

// 순서를 변경한 뒤 과거 index를 다른 질문으로 잘못 복원하지 않도록 저장합니다.
export const QUESTION_ORDER_KEY = QUESTION_ORDER.join(",");

export const orderedQuestions: readonly Question[] = QUESTION_ORDER.map((id) => {
  const question = questionSet.questions.find((item) => item.id === id);
  if (!question) throw new Error(`출제 순서에 잘못된 질문 ID가 있습니다: ${id}`);
  return question;
});

if (new Set(QUESTION_ORDER).size !== questionSet.questions.length ||
    QUESTION_ORDER.length !== questionSet.questions.length) {
  throw new Error("출제 순서에는 모든 질문이 정확히 한 번씩 있어야 합니다.");
}
