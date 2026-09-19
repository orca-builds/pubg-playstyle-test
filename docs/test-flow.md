# v1 테스트 진행 흐름

## 파일 연결

- `src/data/questionOrder.ts`: 모든 사용자에게 공통인 출제 순서. 원본 질문은 수정하지 않습니다.
- `src/types/testProgress.ts`: 진행 중/완료 상태의 저장 타입. 기존 `TestAnswer`를 재사용합니다.
- `src/lib/testProgress.ts`: 답변 교체, 이동 가능 여부, 저장값 검증, 만료 및 완료 판단.
- `src/components/TestRunner.tsx`: `/test`의 화면 상태와 브라우저 저장을 연결합니다.
- `src/components/QuestionCard.tsx`: 질문 원문과 선택지 버튼을 표시합니다.
- `src/components/ResultPreview.tsx`: `/result`에서 완료된 답변을 검증하고 최소 결과를 표시합니다.
- `tests/testProgress.test.mjs`: 진행/복원/오류/결과 연결과 선택지 HTML 검증.

## 출제 순서

```text
q01 → q16 → q06 → q11 → q21 → q02
q07 → q17 → q12 → q22 → q03 → q18
q08 → q13 → q23 → q04 → q09 → q19
q14 → q24 → q05 → q20 → q10 → q15
```

화면의 `7 / 24`는 실제 출제 순서상의 7번째 문항인 `q07`입니다.
화면 24번째는 관리용 `q15`이며, 답변 선택 후 저장 큐를 비우고 결과 완료를 진행합니다.
진행 막대는 현재 위치가 아니라 답변을 완료한 문항 수를 표시합니다.

## 저장 구조

localStorage 키는 `pubg-playstyle-test:attempt`입니다. 한 번에 한 attempt만 보관합니다.

선택지의 `choiceId`는 `q01-choice-1` 같은 고정 내부 ID입니다. 화면의 A/B는
`QuestionCard`가 표시 인덱스로 생성합니다. 질문 순서는 유지하고 새 attempt의 선택지 위치는
24문항 중 정확히 12개를 뒤집습니다. 상세 저장/복구 규칙은 [선택지 표시 순서](choice-display-order.md)를 참고합니다.
과거 `q01-a` 같은 ID가 포함된 저장값은 현재 질문 데이터 검증에서 `invalid`로 처리합니다.
`/test`에서는 안내 후 새 테스트를 시작하고, `/result`에서는 복원 불가 안내를 표시합니다.
이전 답변을 새 ID로 자동 변환하지 않으며 테스트 버전은 변경하지 않습니다.

```ts
{
  testVersion: "v1",
  questionOrderKey: "q01,q16,...", // 실제로는 고정 순서 24개 전체
  status: "in_progress", // 완료하면 "completed"
  currentQuestionIndex: 0, // 0부터 시작하는 화면 위치
  answers: [{ questionId: "q01", choiceId: "q01-choice-1" }],
  startedAt: "2026-09-08T10:00:00.000Z",
  attemptId: "start API가 서버에서 발급한 UUID",
  // completedAt: 완료 상태에만 추가
}
```

선택지를 바꾸면 해당 질문의 답변을 교체합니다. 점수는 저장하거나 누적하지 않습니다.
선택·이동 때마다 전체 객체를 저장하고, 저장에 성공해야 화면 상태도 갱신합니다.
선택은 로컬 답변을 저장하고 현재 문항에 머물며 다음 버튼을 즉시 활성화합니다.
다음 버튼을 누르면 서버 저장을 기다리지 않고 다음 문항 위치를 로컬에 저장한 뒤 이동합니다.
answer API는 백그라운드 직렬 큐에서 처리하며 일반 문항의 선택·이동을 막지 않습니다.
저장 실패 시 계속 답할 수 있고 수동 재시도 안내를 표시합니다. 마지막 완료 단계만 저장을 기다립니다.
별도의 token 없는 answer-sync 기록으로 미저장 답변을 판별해 새로고침 후에도 동기화합니다.
credential과 answer-sync는 진행 객체에 섞지 않습니다. 자세한 API/migration/QA는 `docs/db.md`에 있습니다.
처음부터 다시하기는 확인 화면에서 확정한 뒤 현재 로컬 답변을 저장하고 기존 attempt 큐를 drain합니다.
저장 성공 후 기존 ID로 retry_click을 기록하고 새 attempt와 빈 답변·새 표시 순서를 생성합니다.
drain 중에는 중복 클릭과 취소를 막고, 실패하면 기존 답변·credential을 유지하며 다시 시작을 재시도할 수 있습니다.
취소는 답변과 저장 상태를 바꾸지 않습니다.

## 복원과 만료

- 새 접속과 새로고침 모두 유효한 미완료 상태가 있으면 이어하기 화면을 표시합니다.
- 이어하기는 기존 위치·답변·attemptId·startedAt을 그대로 사용합니다.
- 시작 시각으로부터 정확히 24시간이 지나면 만료됩니다. 답변이나 접속으로 연장하지 않습니다.
- 만료, 테스트 버전 불일치, 출제 순서 불일치, 손상된 저장 데이터는 명시적으로 시작할 때 교체합니다.
- 테스트 도중 24시간이 지나도 다음 선택·이동·이어하기 때 만료를 확인합니다.
- 새 attemptId는 첫 시작, 확인한 재시작, 복원 불가능한 상태를 새로 시작할 때만 생성합니다.
- 완료된 기록은 이어하기 대상으로 취급하지 않습니다. `/test` 복귀는 랜딩으로 이동하며 새 테스트를 생성하지 않습니다.
- 랜딩 CTA와 결과 다시하기에서 새 테스트를 생성합니다. 완료 답변은 탭의 sessionStorage에 별도로 보존합니다.
- 결과 history 항목의 무작위 키를 통해 해당 완료 답변을 선택하므로 다른 테스트를 시작해도 기존 결과를 복원합니다.

## 결과 연결과 오류

마지막 선택은 로컬에 저장하고 결과 보기 버튼을 활성화합니다. 결과 보기를 눌렀을 때만
모든 답변의 서버 저장을 확인한 뒤 최종 답변 24개를 기존 `calculateScore`에 전달합니다.
큐 저장이 실패하면 계산/complete 호출 없이 마지막 문항에 남아 저장 재시도와 결과 보기를 제공합니다.
계산 후 complete API를 호출하고 DB 완료 성공을 확인한 뒤 상태를 `completed`로 저장합니다.
이어서 resultSnapshot 준비와 PostHog test_complete를 처리한 다음 `/test` history 항목을 `/result`로 교체합니다.
랜딩에서 시작한 테스트의 history는 `/` → `/result`가 되어 뒤로가기 후 랜딩, 앞으로가기 후 기존 결과를 표시합니다.
완료 저장 실패 시 이동을 보류하고 답변/계산 결과를 유지하며 결과 보기로 재시도합니다.
완료 응답 유실에 대비해 pending 기록이 있는 동안 답변 수정을 막습니다.
API 계약·DB migration·QA는 `docs/complete-api.md`를 참고하세요.
결과 화면은 저장된 답변을 다시 검증하고 `calculateScore`로 재계산하므로,
별도의 점수 계산 구현이나 외부 저장소에 의존하지 않습니다.

계산·저장 실패 시 현재 답변을 유지하고 재시도 안내를 표시합니다.
저장소가 차단되면 저장을 완료한 것처럼 진행하지 않습니다.
결과가 없거나 유효하지 않은 `/result` 직접 접속에는 안내와 테스트 이동 링크를 표시합니다.

## 검증 방법

```text
node --test tests/scoring.test.mjs tests/testProgress.test.mjs
npm run lint
npm run build
```

브라우저에서 추가로 확인할 항목:

1. `/test` 첫 문항에서 이전·다음이 비활성인지 확인합니다.
2. 느린 네트워크에서도 선택 즉시 다음 버튼이 활성화되며 같은 문항에 머무르고, 다음 클릭 시 저장을 기다리지 않고 이동하는지 확인합니다.
3. 같은 문항에서 답을 바꾸거나 이전 이동 후 답을 바꿔도 선택이 유지되고 다음 클릭 전까지 머무르는지 확인합니다.
4. 새로고침 후 이어하기를 눌러 같은 질문과 선택이 복원되는지 확인합니다.
5. 사이트를 나갔다 재접속해 이어하기 화면이 표시되는지 확인합니다.
6. 느린 네트워크에서 7문항 답변 후 서버에 4개만 저장된 시점에 다시 시작합니다. 기존 ID에 7개 저장 → retry_click → start 순서와 새 ID의 답변 0개를 확인합니다. 오프라인으로 drain을 실패시키면 기존 상태가 유지되고, 온라인 복귀 후 다시 시작 재시도가 성공해야 합니다.
7. 개발자 도구의 저장 객체에서 재시작 전후 attemptId와 startedAt을 비교합니다.
8. 개발자 도구에서 startedAt을 24시간 이전으로 바꾸고 새로고침하면 새 테스트가 시작되는지 확인합니다.
9. testVersion을 `old`로 바꾸고 새로고침하면 과거 응답이 폐기되는지 확인합니다.
10. 24번째 답변만 선택하면 complete가 호출되지 않아야 합니다. 결과 보기를 누른 뒤 큐 저장과 complete 성공을 거쳐 결과가 표시되는지 확인하고 결과 페이지 새로고침과 공유를 확인합니다.
11. 저장소를 차단한 상황에서 오류 안내가 표시되는지 확인합니다.
12. 320~390px 화면에서 긴 질문·선택지에 가로 스크롤이 없는지, Tab/Enter로 조작 가능한지 확인합니다.

자동 테스트는 실제 브라우저 클릭이나 모바일 화면 렌더링 검사를 대신하지 않습니다.

## 시작·결과 생성 로딩

`LoadingOverlay`는 랜딩의 `/test` 이동 대기, TestRunner의 초기 복원·start 처리,
Q24 결과 보기의 queue drain부터 결과 페이지 이동까지 표시합니다.
결과 페이지에서 다시 시작할 때도 같은 비주얼을 사용합니다.
문항 선택·Next 이동·일반 background answer save·restart drain 중에는 표시하지 않습니다.
restart는 기존 drain이 성공하고 새 start를 실행하는 구간에만 overlay를 표시합니다.

이미지는 `/images/loading/loading-repair.png` 원본 RGBA와 1212:1297 비율을 유지합니다.
폭 75vw/최대 320px, 높이 최대 55dvh로 제한합니다. 검은 반투명 배경 위에 이미지,
상황별 설명과 실제 진행률을 뜻하지 않는 가로 애니메이션을 표시합니다.
키보드 배경 접근은 `inert`, 스크롤은 body/root overflow와 touchmove 차단으로 막고,
닫힘·unmount 시 원래 스타일과 포커스를 복원합니다. reduced-motion에서는 bar를 정지합니다.

모바일 QA: 320/390px 세로 및 가로 화면에서 Slow 3G로 시작·결과 보기 overlay,
이미지 비율/여백/스크롤 차단을 확인합니다. start 500, answer 500, complete 500 각각에서
레이어 해제와 기존 재시도 UI를 확인합니다. Q1~Q23은 느린 저장 중에도 overlay 없이
선택 후 Next를 눌러 이동해야 합니다. 요청 중 더블 탭으로 start/complete가 중복되지 않아야 합니다.
OS 움직임 줄이기 설정, 이전/새로고침/restart/결과 공유도 함께 확인합니다.

## 로딩 표시 시간 정책

`src/lib/loadingTiming.ts`의 `LOADING_SHOW_DELAY_MS = 300`,
`LOADING_MIN_VISIBLE_MS = 700`에서 모바일 QA 후 시간을 조정할 수 있습니다.
300ms 미만 작업은 이미지를 표시하지 않고, 한 번 표시한 이미지는 성공 시 최소 700ms 유지합니다.
실패는 최소 시간을 기다리지 않고 오류 UI를 바로 표시합니다.

각 페이지의 `LoadingOverlay`는 처리 상태만 등록합니다. 루트 layout의 `LoadingLayer`가
기존 디자인의 `LoadingOverlayVisual`을 유지해 랜딩 → 테스트 전환 중 표시 시계가 이어집니다.
start API와 progress 초기화는 즉시 처리하고, 빠르게 준비된 Q1 위에 남은 최소 시간 동안
레이어를 유지합니다. 이때 배경은 inert이므로 추가 선택을 받지 않습니다.
complete는 drain·scoring·API·로컬 완료·analytics 처리를 마친 후, 결과 라우팅 직전에만
`waitForMinimum()`으로 남은 표시 시간을 기다립니다. 긴 작업에는 추가 대기가 없습니다.

가짜 타이머 테스트: `node --test --test-isolation=none tests/loadingTiming.test.mjs`.
실제 모바일에서는 API 응답 시간을 약 180ms/600ms/2초로 각각 조절해 미표시/약 700ms 노출/
추가 지연 없는 해제를 확인합니다. start·complete 실패, 빠른 재시도, 로딩 중 뒤로 가기에서도
레이어가 다시 나타나거나 화면을 계속 막지 않는지 확인합니다. 이미지·문구·reduced-motion은 기존과 같습니다.
