# lib

화면 표시와 분리된 계산 함수와 공통 도구 함수를 보관합니다.

예: 답변 점수 합산, 메인 4축의 결과 결정, 가장 강한 보조 성향 태그 선택.
계산에 필요한 데이터는 함수의 입력으로 받고 계산 결과를 반환하도록
작성하면 화면과 독립적으로 이해하고 확인하기 쉽습니다.

`scoring.ts`는 v1 점수 계산을 담당합니다. 기존 타입과 질문·결과·보조 태그
데이터를 읽으며, 데이터나 입력 답변은 수정하지 않습니다.

```ts
import { calculateScore, ScoringError } from "@/lib/scoring";
import type { TestAnswer } from "@/lib/scoring";

// 실제 호출 시에는 q01~q24에 각각 하나씩 선택한 답변 24개를 전달합니다.
const answers: TestAnswer[] = [
  { questionId: "q01", choiceId: "q01-a" },
  // ... 나머지 문항의 답변
];

try {
  const result = calculateScore(answers);
  console.log(result.mainResult.name, result.displaySubTags);
} catch (error) {
  if (error instanceof ScoringError) {
    console.log(error.code, error.message);
  }
}
```

- `mainScores`, `subScores`: 성향 키별 원점수입니다.
- `mainPercentages`: 각 메인축의 양쪽 합계를 기준으로 계산한 0~100 값입니다.
- `mainTraits`, `mainResult`: 축별 우세 성향과 해당 결과 유형입니다.
- `subAxes`: 축별 0~1 편향도, 방향, 강도(`strong`/`weak`/`neutral`), 태그 문구입니다.
- `displaySubTags`: 최종 표시할 태그 1~2개입니다. 약한 성향은 포함하지 않습니다.
- `testVersion`: 계산에 사용한 질문 버전입니다.

편향도는 `abs(A - B) / (A + B)`이며 합계가 0이면 0입니다.
0.5 이상은 강한 후보, 0.25 이상 0.5 미만은 약한 성향, 나머지는 중립입니다.
후보가 2개 이상이면 편향도가 높은 2개를 고릅니다. 동률은 팀 포지션 →
낙하 방식 → 파밍 템포 → 자기장 운영 → 장비 선택 순서로 처리합니다.
후보가 1개이면 그 태그와 올라운더, 없으면 올라운더만 반환합니다.

누락 응답은 `MISSING_ANSWERS`, 중복은 `DUPLICATE_ANSWER`, 잘못된 선택지는
`INVALID_CHOICE` 오류를 발생시킵니다. 메인축 동점(0:0 포함)은
`MAIN_AXIS_TIE` 오류로 처리하며 임의 결과를 만들지 않습니다.
답변을 바꿀 때는 기존 답변을 교체한 후 전체 답변으로 다시 계산하세요.

`calculateMainResult`와 `calculateSubResult`는 이미 합산한 점수를 검사하는
순수 함수입니다. 최종 사용자 결과는 답변 누락까지 검사하는 `calculateScore`를 사용합니다.

계산 테스트: `node --test tests/scoring.test.mjs`
