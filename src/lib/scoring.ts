import { questionSet } from "@/data/questions";
import { resultTypes } from "@/data/resultTypes";
import { allRounderTag, subAxisNames, subTraitTags } from "@/data/subTraits";
import type {
  MainAxis, MainTrait, MainTraits, Question, ResultId, ResultType,
  SubAxis, SubTrait, SubTraits, SubTraitTags,
} from "@/types/test";

export type TestAnswer = {
  readonly questionId: string;
  readonly choiceId: string;
};

export type MainScores = Readonly<Record<MainTrait, number>>;
export type SubScores = Readonly<Record<SubTrait, number>>;
export type SubStrength = "strong" | "weak" | "neutral";
export type SubAxisResults = {
  readonly [Axis in SubAxis]: {
    readonly bias: number;
    readonly direction: SubTraits[Axis] | "neutral";
    readonly strength: SubStrength;
    readonly label: string;
  };
};

export type ScoringResult = {
  readonly testVersion: string;
  readonly mainScores: MainScores;
  readonly mainPercentages: MainScores;
  readonly mainTraits: Readonly<MainTraits>;
  readonly mainResult: ResultType;
  readonly subScores: SubScores;
  readonly subAxes: SubAxisResults;
  readonly displaySubTags: readonly string[];
};

export type ScoringErrorCode =
  | "INVALID_ANSWER" | "UNKNOWN_QUESTION" | "INVALID_CHOICE"
  | "DUPLICATE_ANSWER" | "MISSING_ANSWERS" | "INVALID_SCORE"
  | "MAIN_AXIS_TIE" | "RESULT_NOT_FOUND" | "UNSUPPORTED_VERSION";

// 호출하는 쪽에서 code로 오류 원인을 구분할 수 있습니다.
export class ScoringError extends Error {
  constructor(public readonly code: ScoringErrorCode, message: string) {
    super(message);
    this.name = "ScoringError";
  }
}

const mainAxisPairs = {
  combatPosition: ["combat", "position"],
  frontlineSupport: ["frontline", "support"],
  pressureDesign: ["pressure", "design"],
  riskSafe: ["risk", "safe"],
} as const satisfies { [Axis in MainAxis]: readonly [MainTraits[Axis], MainTraits[Axis]] };

// 편향도가 같으면 이 순서를 우선합니다. 응답 순서와 무관합니다.
const subAxisOrder: readonly SubAxis[] = [
  "mainBodyFlank", "hotdropTail", "fullLootFastLoot",
  "centerEdge", "standardGearSpecialGear",
];

function validateScores(scores: Readonly<Record<string, number>>) {
  for (const [trait, score] of Object.entries(scores)) {
    if (!Number.isSafeInteger(score) || score < 0) {
      throw new ScoringError("INVALID_SCORE", `${trait}: v1 점수는 0 이상의 안전한 정수여야 합니다.`);
    }
  }
}

/** 합산한 메인 점수로 백분율과 결과를 구합니다. 동점이면 오류를 던집니다. */
export function calculateMainResult(scores: MainScores) {
  validateScores(scores);
  const mainPercentages = { ...scores };

  for (const [axis, [first, second]] of Object.entries(mainAxisPairs)) {
    const total = scores[first] + scores[second];
    if (!Number.isSafeInteger(total)) {
      throw new ScoringError("INVALID_SCORE", `${axis}: 점수 합계를 확인해주세요.`);
    }
    if (scores[first] === scores[second]) {
      throw new ScoringError("MAIN_AXIS_TIE", `${axis}: 메인축 점수가 동점입니다.`);
    }
    mainPercentages[first] = (scores[first] / total) * 100;
    mainPercentages[second] = (scores[second] / total) * 100;
  }

  const mainTraits: MainTraits = {
    combatPosition: scores.combat > scores.position ? "combat" : "position",
    frontlineSupport: scores.frontline > scores.support ? "frontline" : "support",
    pressureDesign: scores.pressure > scores.design ? "pressure" : "design",
    riskSafe: scores.risk > scores.safe ? "risk" : "safe",
  };
  const id: ResultId = `${mainTraits.combatPosition}-${mainTraits.frontlineSupport}-${mainTraits.pressureDesign}-${mainTraits.riskSafe}`;
  const result = resultTypes[id];
  if (!result || result.id !== id ||
      Object.entries(mainTraits).some(([axis, trait]) => result.mainTraits[axis as MainAxis] !== trait)) {
    throw new ScoringError("RESULT_NOT_FOUND", `${id}: 일치하는 결과 유형이 없습니다.`);
  }

  return {
    mainScores: { ...scores },
    mainPercentages,
    mainTraits,
    // 반환값 수정이 원본 결과 데이터에 영향을 주지 않도록 복사합니다.
    mainResult: { ...result, mainTraits: { ...result.mainTraits } },
  };
}

/** 합산한 보조 점수로 편향도, 방향, 최종 표시 태그를 구합니다. */
export function calculateSubResult(scores: SubScores) {
  validateScores(scores);
  const labels: SubTraitTags = subTraitTags;

  function analyzeAxis<Axis extends SubAxis>(
    axis: Axis, first: SubTraits[Axis], second: SubTraits[Axis],
  ) {
    const total = scores[first] + scores[second];
    if (!Number.isSafeInteger(total)) {
      throw new ScoringError("INVALID_SCORE", `${subAxisNames[axis]}: 점수 합계를 확인해주세요.`);
    }
    const bias = total === 0 ? 0 : Math.abs(scores[first] - scores[second]) / total;
    const strength: SubStrength = bias >= 0.5 ? "strong" : bias >= 0.25 ? "weak" : "neutral";
    const direction: SubTraits[Axis] | "neutral" = strength === "neutral"
      ? "neutral"
      : scores[first] > scores[second] ? first : second;
    return { bias, direction, strength, label: labels[axis][direction] };
  }

  const subAxes: SubAxisResults = {
    mainBodyFlank: analyzeAxis("mainBodyFlank", "mainBody", "flank"),
    hotdropTail: analyzeAxis("hotdropTail", "hotdrop", "tail"),
    fullLootFastLoot: analyzeAxis("fullLootFastLoot", "fullLoot", "fastLoot"),
    centerEdge: analyzeAxis("centerEdge", "center", "edge"),
    standardGearSpecialGear: analyzeAxis("standardGearSpecialGear", "standardGear", "specialGear"),
  };
  const candidates = subAxisOrder
    .map((axis, order) => ({ ...subAxes[axis], order }))
    .filter((axis) => axis.strength === "strong")
    .sort((a, b) => b.bias - a.bias || a.order - b.order);
  const displaySubTags = candidates.slice(0, 2).map((axis) => axis.label);
  if (displaySubTags.length < 2) displaySubTags.push(allRounderTag);

  return { subScores: { ...scores }, subAxes, displaySubTags };
}

/** v1 최종 결과용 함수: 각 질문에 정확히 하나의 유효한 답변이 필요합니다. */
export function calculateScore(answers: readonly TestAnswer[]): ScoringResult {
  if (questionSet.version !== "v1") {
    throw new ScoringError("UNSUPPORTED_VERSION", "이 계산 함수는 v1 질문 데이터 전용입니다.");
  }
  if (!Array.isArray(answers)) {
    throw new ScoringError("INVALID_ANSWER", "답변 목록은 배열이어야 합니다.");
  }

  const questions: readonly Question[] = questionSet.questions;
  const answered = new Set<string>();
  const mainScores: Record<MainTrait, number> = {
    combat: 0, position: 0, frontline: 0, support: 0,
    pressure: 0, design: 0, risk: 0, safe: 0,
  };
  const subScores: Record<SubTrait, number> = {
    mainBody: 0, flank: 0, hotdrop: 0, tail: 0, fullLoot: 0,
    fastLoot: 0, center: 0, edge: 0, standardGear: 0, specialGear: 0,
  };

  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== "string" || typeof answer.choiceId !== "string") {
      throw new ScoringError("INVALID_ANSWER", "각 답변에는 questionId와 choiceId가 필요합니다.");
    }
    const question = questions.find((item) => item.id === answer.questionId);
    if (!question) {
      throw new ScoringError("UNKNOWN_QUESTION", `${answer.questionId}: 존재하지 않는 질문입니다.`);
    }
    if (answered.has(question.id)) {
      throw new ScoringError("DUPLICATE_ANSWER", `${question.id}: 답변이 중복되었습니다.`);
    }
    const choice = question.choices.find((item) => item.id === answer.choiceId);
    if (!choice) {
      throw new ScoringError("INVALID_CHOICE", `${question.id}: 해당 질문의 선택지가 아닙니다.`);
    }
    answered.add(question.id);
    // 사용자가 전달한 점수가 아니라 원본 선택지의 점수만 합산합니다.
    for (const trait of Object.keys(mainScores) as MainTrait[]) {
      mainScores[trait] += choice.scoreDelta.main?.[trait] ?? 0;
    }
    for (const trait of Object.keys(subScores) as SubTrait[]) {
      subScores[trait] += choice.scoreDelta.sub?.[trait] ?? 0;
    }
  }

  const missing = questions.filter((question) => !answered.has(question.id));
  if (missing.length > 0) {
    throw new ScoringError("MISSING_ANSWERS", `누락된 답변: ${missing.map((question) => question.id).join(", ")}`);
  }

  return {
    testVersion: questionSet.version,
    ...calculateMainResult(mainScores),
    ...calculateSubResult(subScores),
  };
}
