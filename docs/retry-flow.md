# 결과 페이지 Retry DB 연결

ResultPreview.handleStartTest에서 기존 완료 ID로 retry_click을 기록하고
startDatabaseAttempt(true)를 호출한다. visitorContext의 방문자/현재 세션/최초 유입 정보와
현재 questionSet 및 QUESTION_ORDER_KEY를 그대로 사용한다.

새 서버 ID/token을 받은 뒤 credential을 쓰고 빈 progress를 마지막으로 저장한다.
발급 전에 이전 완료 답변과 완료 시각을 sessionStorage에 보존한다. 보존 실패 시 발급하지 않는다.
활성 progress만 새 진행으로 교체한다. 결과 history 항목은 별도의 무작위 키로 완료 답변에 연결되며,
resultSnapshot은 해당 답변에서 결과를 복원한다. React는 이동이 끝날 때까지 이전 결과를 유지한다.
이전 answer-sync/completion-pending 보조 저장값은 commit 이후 제거한다. 제거 실패 시에도
각 보조 저장값은 attemptId를 비교하므로 새 시도에는 적용되지 않는다.
이전 analytics의 attempt별 기록과 visitor/attribution/session은 삭제하지 않는다.

credential은 기존 localStorage의 db-credential:v1을 교체하며 progress와 동일한 24시간
복구 정책을 따른다. token은 React 상태, URL, DOM, 오류, 로그, analytics에 넣지 않는다.

저장 성공 → 새 ID의 test_start(is_retry=true) → /test → Q1 → 새 ID의 question_view 순서다.
TestRunner는 유효한 credential이 있고 답변이 없는 진행을 바로 Q1으로 복구한다.
답변이 있는 진행은 기존 이어하기 화면을 유지한다. 어느 복구도 start를 재호출하지 않는다.

결과 페이지 ref 잠금과 disabled 버튼이 연속 클릭을 차단하고 공통 start helper의 in-flight
Promise가 동시 호출을 합친다. API 실패는 기존 progress/credential/snapshot을 보존하며
결과 아래 오류와 ‘다시 하기 재시도’ 버튼을 표시한다. 로컬 commit 실패는 이전 credential을
복원하고, 같은 문서에서 재시도할 때 메모리의 발급 결과를 사용해 start를 다시 호출하지 않는다.
서버 start API에 멱등성 키는 없으므로 응답 유실 후 수동 재시도나 요청 중 새로고침,
여러 탭의 동시 시작까지 중복 없는 발급을 보장하지는 않는다.

DB 요청은 기존 start POST 한 종류다. 이전 test_attempts/answers에 update/delete를 보내지 않는다.
서버는 새 UUID와 token/hash를 만들고 is_retry=true, is_completed=false,
last_question_index=0으로 새 행만 insert한다. 새 답변은 첫 선택을 저장하기 전까지 0행이다.
이번 작업에 추가 migration은 없다.

완료 후 랜딩 CTA는 startDatabaseAttempt(false)로 새 테스트를 시작한다. cta_click 의미를
유지하며 retry_click은 기록하지 않는다. 미완료 상태가 있으면 기존 진행으로 이동한다.
단순 `/test` 복귀는 완료 상태를 새 attempt로 덮어쓰지 않고 랜딩으로 돌려보낸다.
뒤로가기/앞으로가기 및 Android 재QA는 [상태 복원 QA](completed-navigation-qa.md)를 참고한다.

## 수동 QA

1. 24문항 완료 후 Table Editor에서 기존 행 ID와 완료 시각·결과·24개 답변을 확인한다.
2. Network를 느리게 설정하고 다시 하기를 빠르게 두 번 누른다. start POST 1회,
   대기 중 기존 결과 유지와 버튼 비활성화를 확인한다. token을 복사하거나 공유하지 않는다.
3. Q1에서 선택하기 전 새 행이 다른 ID/같은 anonymous_id/is_retry=true/
   is_completed=false/last_question_index=0인지, 새 ID의 answers가 0행인지 확인한다.
   이전 행의 완료 시각·점수와 24개 답변이 그대로인지 확인한다.
4. PostHog에서 retry_click은 이전 ID, test_start와 첫 question_view는 새 ID인지,
   anonymous_id는 같고 새 test_start의 is_retry=true인지 확인한다.
5. 새 Q1을 새로고침한다. start 추가 호출 없이 복구되어야 한다. 답변 저장 후 새로고침하면
   이어하기로 같은 ID/답변이 복구되어야 한다.
6. 다음 완료 결과에서 Network를 Offline으로 바꾸고 다시 하기: 결과 유지, 오류 안내,
   test_start 없음. Online 복구 후 재시도하면 정상 시작되어야 한다.

자동 테스트는 제어된 fetch/저장소 및 서버 insert 계약을 검증한다. 실제 Supabase의 행과
PostHog 수집 결과는 위 절차로 별도 확인한다.
