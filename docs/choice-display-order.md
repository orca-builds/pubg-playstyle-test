# Attempt별 선택지 표시 순서

createAttempt에서 createChoiceDisplayOrder를 한 번 호출한다. Fisher–Yates로 24개 질문의
인덱스를 섞은 뒤 12개 질문의 선택지 순서를 뒤집는다. 원본 choices 배열·ID·텍스트·scoreDelta는
수정하지 않는다. 새 attempt는 정확히 choice-1 상단 12개, choice-2 상단 12개다.

localStorage의 기존 `pubg-playstyle-test:attempt` 객체 안에 `choiceDisplayOrder`를 저장한다.
예: `{ "q01": ["q01-choice-2", "q01-choice-1"], ... }`.
같은 객체의 attemptId에 연결되며 기존 24시간 진행 복구 정책을 따른다.
start helper는 서버 ID 발급 후 생성하고 credential과 진행 저장이 성공한 뒤 Q1을 연다.
발급 후 로컬 저장 실패 시 메모리의 progress를 재사용하므로 수동 재시도 때 순서도 유지된다.

복원 시 24문항 키 및 각 문항의 서로 다른 유효한 선택지 ID 두 개를 검증한다.
손상된 값은 기존 invalid 진행 복구 흐름으로 처리하며 몰래 다시 섞지 않는다.
이 필드가 없는 이전 버전 attempt는 기존 원본 순서를 계속 사용한다. 이전 사용자의 화면 위치를
바꾸지 않기 위한 호환 정책이므로 12/12 균형은 새로 만든 attempt에 적용된다.

이동·답 변경·완료는 기존 progress를 복사해 순서를 유지한다. Retry 성공 시 새 progress에
새 순서를 생성한다. 독립 랜덤 생성이므로 우연히 같은 배치가 나올 가능성은 있지만 이전 값을
재사용하지 않는다. 렌더링이나 새로고침에서 난수를 호출하지 않는다.

TestRunner가 저장된 순서를 QuestionCard에 전달한다. QuestionCard와 trackAnswer는 같은
getDisplayedChoices를 사용한다. 첫 표시 버튼은 A/1, 두 번째는 B/2이며 클릭 콜백과
answer_change에는 내부 ID를 전달한다. Supabase answers에는 기존 answer_id만 저장한다.
question_order_key, DB 스키마, start/answer/complete API, scoring 로직은 변경하지 않는다.

## 브라우저 QA

1. 새 테스트를 시작하고 Application → Local Storage에서 진행 객체의 choiceDisplayOrder를
   확인한다. 24문항이며 각 배열의 첫 ID가 choice-1인 항목 12개, choice-2인 항목 12개여야 한다.
   별도 credential 저장값은 복사하거나 공유하지 않는다.
2. 뒤집힌 문항에서 A를 선택하고 PostHog question_answer의 answer_id가 choice-2,
   display_position=1/display_label=A인지 확인한다. B도 같은 방법으로 확인한다.
3. 답을 저장하고 다음 → 이전, 새로고침 → 이어하기를 실행한다. 문구 위치와 선택 표시가
   유지되어야 한다. 답을 바꿔도 위치는 변하지 않아야 한다.
4. Supabase answers에는 선택한 내부 ID만 저장되고 표시 A/B 컬럼이 추가되지 않았는지 확인한다.
5. 완료 후 Retry로 새 attemptId와 새 choiceDisplayOrder가 생성되는지 확인한다.
6. 결과 이미지·공유·다시 하기와 결과 페이지 복구가 기존처럼 동작하는지 확인한다.

자동 테스트는 표시/Analytics/DB 요청의 연결과 복구·균형·점수 불변성을 검증한다.
실제 브라우저와 원격 PostHog/Supabase 수집은 위 절차로 별도 확인한다.
