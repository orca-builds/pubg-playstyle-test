import { allRounderTag, subTraitTags } from "@/data/subTraits";

type AxisTags = typeof subTraitTags;
type SupportTag = {
  [Axis in keyof AxisTags]: AxisTags[Axis][keyof AxisTags[Axis]];
}[keyof AxisTags] | typeof allRounderTag;

// 결과 화면 전용 설명입니다. 태그 선택과 점수 계산에는 사용하지 않습니다.
export const supportTagDescriptions: Readonly<Record<string, string>> = {
  본대형: "팀과 힘을 모아 같은 방향에서 압박하는 편",
  날개형: "팀과 다른 각을 잡아 교전 기회를 만드는 편",
  유동형: "상황에 따라 본대 합류와 측면 이동을 섞는 편",
  대꼴형: "초반부터 교전 기회가 있는 곳에 내리는 편",
  꼬리형: "다른 팀의 낙하를 보고 충돌을 줄이는 편",
  "상황 낙하형": "상황을 보고 경쟁과 안전 사이에서 고르는 편",
  풀세팅형: "필요한 물자를 충분히 갖춘 뒤 이동하는 편",
  "실속 파밍형": "기본 장비를 갖추면 이동을 먼저 시작하는 편",
  "균형 파밍형": "물자 준비와 이동 타이밍을 함께 살피는 편",
  "중앙 선점형": "자기장 중앙의 좋은 자리를 먼저 노리는 편",
  "외곽 운영형": "외곽의 안정적인 자리를 골라 운영하는 편",
  "상황 운영형": "상황에 따라 중앙과 외곽 자리를 고르는 편",
  "기본기 충실형": "탄약과 회복 등 기본 물자를 든든히 챙기는 편",
  보따리형: "특수 장비를 활용해 유리한 교전각을 만드는 편",
  "만능 장비형": "상황에 맞춰 기본 물자와 특수 장비를 고르는 편",
  올라운더: "한쪽에 치우치지 않고 상황에 맞춰 움직이는 편",
} satisfies Record<SupportTag, string>;
