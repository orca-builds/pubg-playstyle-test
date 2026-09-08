import type { SubAxis, SubTraitTags } from "@/types/test";

// 객체의 키가 기존 보조축 ID입니다. 같은 ID로 아래 태그 정보를 찾습니다.
export const subAxisNames = {
  mainBodyFlank: "팀 포지션",
  hotdropTail: "낙하 방식",
  fullLootFastLoot: "파밍 템포",
  centerEdge: "자기장 운영",
  standardGearSpecialGear: "장비 선택",
} as const satisfies Record<SubAxis, string>;

// 성향 키는 questions.ts의 scoreDelta.sub와 동일합니다.
// neutral은 각 축의 중립 표시용이며 질문에서 점수를 주는 성향이 아닙니다.
export const subTraitTags = {
  mainBodyFlank: {
    mainBody: "본대형",
    flank: "날개형",
    neutral: "유동형",
  },
  hotdropTail: {
    hotdrop: "대꼴형",
    tail: "꼬리형",
    neutral: "상황 낙하형",
  },
  fullLootFastLoot: {
    fullLoot: "풀세팅형",
    fastLoot: "실속 파밍형",
    neutral: "균형 파밍형",
  },
  centerEdge: {
    center: "중앙 선점형",
    edge: "외곽 운영형",
    neutral: "상황 운영형",
  },
  standardGearSpecialGear: {
    standardGear: "기본기 충실형",
    specialGear: "보따리형",
    neutral: "만능 장비형",
  },
} as const satisfies SubTraitTags;

// 특별 태그의 표시 문구입니다. 적용 조건과 선택 로직은 추후 구현합니다.
export const allRounderTag = "올라운더";
