# 완료 결과 history 복원 QA

## 코드로 확인한 원인과 수정

기존 완료 핸들러는 router.push('/result')를 사용해 /test를 history에 남겼다.
TestRunner.initialize는 completed 상태에서도 startNew(..., true)를 호출했다.
mount나 persisted pageshow로 이 경로에 들어오면 새 서버 attempt를 발급받고,
유일한 로컬 완료 progress를 미완료 progress로 교체했다. 결과 화면은 그 값만 읽으므로
앞으로가기에서 완료 결과를 복원할 수 없었다. popstate 처리는 없었다.

이는 Android 전용 이벤트 코드의 문제가 아니다. Android와 일반 브라우저의 실제 캐시·history
복원 조건 차이는 실기기 추적 없이 확정할 수 없다. 자동 테스트는 위 코드 경로를 재현한다.

- 완료 이동은 replace로 /test 기록을 제거한다. 전체 history 이동을 차단하거나 가로채지 않는다.
- 남아 있는 완료 /test가 mount/pageshow/popstate로 복귀하면 상태를 비우고 랜딩으로 replace한다.
- 오래된 문항 핸들러도 저장된 상태/ID를 확인해 답변·완료·재시작을 실행하지 않는다.
- 새 attempt 발급 전에 완료 progress를 sessionStorage에 보존한다. token은 보존하지 않는다.
- /result 구독 시 Next의 history.state를 유지하면서 DB ID와 무관한 무작위 키를 붙인다.
  결과는 이 키에 대응하는 완료 답변을 기존 restoreAttempt/calculateScore로 복원한다.
- 새 탭에서 과거 결과를 찾아주는 UI/API는 추가하지 않는다. 공유 route는 history 처리 대상이 아니다.
- result_view의 기존 mount/ref 중복 방지 의미를 유지한다. start/complete 중복 방지 정책도 그대로다.

## Android 실기기 확인 순서 (미실행)

수정 빌드의 주소를 사용한다. 사용한 기기, Android 버전, 브라우저 이름/버전, 뒤로가기 방식을 기록한다.
가능하면 Chrome 원격 디버깅에서 Network의 Preserve log를 켜고 PostHog와 DB를 함께 확인한다.
ID는 내부 비교만 하고 write_token이 포함된 요청 본문이나 저장소를 캡처·공유하지 않는다.

1. 랜딩 CTA로 시작하고 24문항 완료. 결과 유형과 보조 태그를 기록한다.
   DB에서 완료 행과 24개 답변, 최초 유입 정보를 확인한다.
2. Android 시스템 뒤로가기 버튼을 한 번 누른다. 랜딩이 표시되고 Q1이 나타나지 않아야 한다.
   브라우저 메뉴의 앞으로가기로 돌아와 같은 결과 유형·태그를 확인한다.
3. 2번을 시스템 제스처로도 반복한다. 브라우저에서 제공하는 뒤로가기 동작으로도 반복한다.
   해당 기기에 버튼/제스처 중 한 가지만 있으면 가능한 방식과 미확인 방식을 구분해 기록한다.
4. 결과 화면을 새로고침한다. 같은 결과가 표시되어야 한다.
   2~4번 동안 start/answers/complete POST가 추가되지 않고, DB 완료 ID·24개 답변이 유지되어야 한다.
   PostHog에 test_start/test_complete가 추가되지 않아야 한다.
   result_view는 새 mount에서는 기록될 수 있으며 같은 mount에서는 중복되지 않아야 한다.
5. 결과에서 시스템 뒤로가기로 랜딩에 간 뒤 CTA를 누른다.
   새 ID, Q1, 선택 전 답변 0개, is_retry=false를 확인한다.
   cta_click과 새 test_start가 기록되고 retry_click은 기록되지 않아야 한다.
   이전 완료 DB 행·답변·최초 유입 정보가 유지되어야 한다.
6. 새 테스트 중 몇 문항에 답한 뒤 브라우저 뒤로가기/앞으로가기를 한다.
   같은 ID·답변·문항 위치로 이어하기가 가능하고 start가 추가되지 않아야 한다.
7. 테스트를 완료한 뒤 결과의 다시 하기를 누른다.
   새 ID, Q1, 선택 전 답변 0개, is_retry=true를 확인한다.
   retry_click은 이전 ID, test_start는 새 ID이며 이전 완료 행·24개 답변은 그대로여야 한다.
   뒤로가기로 이전 결과에 돌아간 뒤 새로고침해도 이전 결과가 표시되어야 한다.
8. 외부 페이지에서 정상 공유 URL로 신규 방문해 결과 표시와 외부 페이지로의 뒤로가기를 확인한다.
   잘못된 공유 URL에서는 기존 fallback이 유지되어야 한다.
9. 저장소 접근 차단 등 복원 실패 환경에서 무한 로딩 대신 안내/재시도/명시적 시작 버튼이 나오는지 확인한다.
   복원 실패만으로 새 start/complete가 호출되거나 기존 완료 상태가 미완료로 바뀌면 안 된다.
   접근을 복구한 뒤 결과 다시 불러오기를 확인한다.

## 자동 검증 범위

`tests/completedNavigation.test.mjs`는 실제 컴포넌트 초기화·클릭 핸들러와 저장/복원 모듈을 실행한다.
history, pageshow, popstate, fetch 및 저장소는 테스트 모델이다. 실제 브라우저 엔진이나
Android 시스템 버튼/제스처를 실행한 E2E 테스트는 아니다. 실기기 QA가 별도로 필요하다.

검증 결과: 신규 회귀 테스트 12개 및 전체 테스트 273개 통과. TypeScript, ESLint,
production build 통과. 기본 제한 환경의 build는 기존 Google Fonts 다운로드에 실패했으나,
네트워크 접근이 가능한 실행 환경에서 같은 npm run build가 성공했다.

## 변경 파일

- 화면: `src/components/TestRunner.tsx`, `LandingContent.tsx`, `ResultPreview.tsx`, `ResultContent.tsx`
- 저장/복원: `src/lib/resultHistory.ts` (신규), `resultSnapshot.ts`, `startDatabaseAttempt.ts`
- 신규 회귀: `tests/completedNavigation.test.mjs`
- 기존 테스트 보완: `tests/completeDatabaseAttempt.test.mjs`, `resultSnapshot.test.mjs`, `loadingOverlay.test.mjs`
- 테스트 환경: `tests/helpers/analyticsHarness.mjs`, `answerQueueHarness.mjs`
- 문서: `docs/completed-navigation-qa.md` (신규), `retry-flow.md`, `test-flow.md`
