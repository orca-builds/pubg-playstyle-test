// 각 축에는 정해진 두 성향 중 하나만 사용할 수 있습니다.
export type MainTraits = {
  combatPosition: "combat" | "position";
  frontlineSupport: "frontline" | "support";
  pressureDesign: "pressure" | "design";
  riskSafe: "risk" | "safe";
};

export type MainAxis = keyof MainTraits;
export type MainTrait = MainTraits[MainAxis];

export type SubTraits = {
  mainBodyFlank: "mainBody" | "flank";
  hotdropTail: "hotdrop" | "tail";
  fullLootFastLoot: "fullLoot" | "fastLoot";
  centerEdge: "center" | "edge";
  standardGearSpecialGear: "standardGear" | "specialGear";
};

export type SubAxis = keyof SubTraits;
export type SubTrait = SubTraits[SubAxis];

// 성향별 점수에 더할 값입니다. 생략한 성향의 변화량은 0으로 취급합니다.
// 양수는 증가, 음수는 감소를 뜻하며 실제 계산은 추후 src/lib에 구현합니다.
export type ScoreDelta = {
  readonly main?: Readonly<Partial<Record<MainTrait, number>>>;
  readonly sub?: Readonly<Partial<Record<SubTrait, number>>>;
};

export type Choice = {
  readonly id: string;
  readonly text: string;
  readonly scoreDelta: ScoreDelta;
};

export type Question = {
  readonly id: string;
  readonly text: string;
  // 질문에는 최소 두 개의 선택지가 필요합니다.
  readonly choices: readonly [Choice, Choice, ...Choice[]];
};

export type QuestionSet = {
  readonly version: string;
  readonly questions: readonly Question[];
};

// 네 축에서 하나씩 고른 2 × 2 × 2 × 2 = 16개 조합만 ID로 허용합니다.
export type ResultId =
  `${MainTraits["combatPosition"]}-${MainTraits["frontlineSupport"]}-${MainTraits["pressureDesign"]}-${MainTraits["riskSafe"]}`;

export type ResultType = {
  readonly id: ResultId;
  readonly name: string;
  readonly summary: string;
  readonly imageSrc: string | null;
  readonly imageAlt: string;
  readonly description: string;
  readonly mainTraits: Readonly<MainTraits>;
};

// 작성 중에는 일부 결과만 등록할 수 있습니다.
export type ResultTypeCatalog = Partial<Record<ResultId, ResultType>>;

// 보조축마다 양쪽 성향 이름과 중립 태그를 모두 등록합니다.
export type SubTraitTags = {
  readonly [Axis in SubAxis]: Readonly<
    Record<SubTraits[Axis] | "neutral", string>
  >;
};
