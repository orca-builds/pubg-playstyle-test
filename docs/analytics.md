# Analytics 2단계

`posthog-js` 초기화는 `src/instrumentation-client.ts`에서 시작합니다. 화면은 SDK 대신
`analytics.ts`와 `testAnalytics.ts`를 사용합니다. 현재 Next.js 16.3.4 / React 19.2.8
App Router 구조와 [PostHog 공식 사용법](https://posthog.com/docs/libraries/js/usage)을 따릅니다.
추가 패키지, Supabase 쓰기, 선택지 랜덤화, 공유 이벤트는 없습니다.

## 공통 context와 저장 수명

| 값 | 위치 | 수명/의미 |
| --- | --- | --- |
| anonymous_id + 최초 유입 5개 속성 | localStorage `pubg-playstyle-test:visitor:v1` | UUID v4. 유효한 기존 값 재사용. 사이트 저장소를 지우기 전까지 유지 |
| session_id | sessionStorage `pubg-playstyle-test:session:v1` | UUID v4. 새로고침 유지, 새로운 탭 저장소에서는 새 값 |
| attempt_id | 기존 localStorage `pubg-playstyle-test:attempt`의 attemptId | 새 테스트 시작 시 생성, 복구·이전·다음에서 유지, retry에서 새 UUID |
| test_version | 기존 questionSet.version / 해당 attempt.testVersion | 여러 파일에 버전 문자열을 복제하지 않음 |
| 행동 횟수, is_retry | localStorage `pubg-playstyle-test:analytics:attempt:<attemptId>` | 시도별 보조 기록. 새로고침 유지, 기존 테스트 저장 형식과 분리 |
| 시작·완료 중복 방지 | localStorage `pubg-playstyle-test:analytics:sent:start:<attemptId>`, `...:complete:<attemptId>` | 해당 시도의 중복 호출 억제 |
| 랜딩 중복 방지 | sessionStorage `pubg-playstyle-test:analytics:sent:landing:<sessionId>` | 해당 세션의 최초 랜딩만 기록 |
| 결과에서 다시하기 요청 | sessionStorage `pubg-playstyle-test:analytics:retry-request` | `/test`에서 새 시도 저장 성공 후 소비 |

브라우저의 탭 복제/세션 복원 기능이 sessionStorage 자체를 복사·복구하면 session_id도
이어질 수 있습니다. 일반적인 새 탭 저장소를 세션 경계로 사용하며, 탭 사이의 별도 통신은 추가하지 않았습니다.
저장소 차단 시 분석 데이터는 해당 문서의 메모리로 대체됩니다. 이 경우 새로고침을 넘는
ID 유지·중복 억제는 보장하지 못합니다. 테스트 저장 실패에 대한 기존 UI 처리는 유지합니다.
분석 기록에는 자동 만료를 추가하지 않았으며 사이트 저장소 삭제 시 함께 제거됩니다.

`visitorContext.ts`의 `VisitorContext`, `InitialAttribution`, `getVisitorContext()`,
`readInitialAttribution()`은 PostHog와 독립적입니다. 향후 DB writer는 이 context와
기존 attemptId/testVersion을 조합해 test_attempts/answers에 같은 의미로 저장할 수 있습니다.
현재 세션의 context를 반환하므로 향후 DB 도입 시 시도 시작 시점의 값을 저장하면 됩니다.

## 최초 유입과 개인정보 범위

첫 클라이언트 초기화에서 유입 정보를 읽어 anonymous_id와 함께 저장합니다. SDK 설정이 없어도
공통 context는 준비하며 PostHog SDK 로딩·전송은 하지 않습니다. 다른 UTM으로 재방문해도 덮어쓰지 않습니다.

- utm_source → initial_source (없거나 유효하지 않으면 direct)
- utm_medium → initial_medium (없거나 유효하지 않으면 none)
- utm_campaign → initial_campaign (없거나 유효하지 않으면 빈 문자열)
- document.referrer → initial_referrer (origin만 보관, 없으면 빈 문자열)
- 진입 URL pathname → landing_page (query/hash 제외)

UTM은 영문·숫자·점·밑줄·물결표·하이픈으로 된 1~120자의 캠페인 식별자만 허용합니다.
이메일, 자유 입력 문장, 임의 query parameter를 수집하지 않습니다. 캠페인 링크도 이 형식으로 작성하세요.
device_type은 단순 UA 분류로 mobile/tablet/desktop을 반환합니다.
PostHog identify/alias/reset은 호출하지 않습니다. anonymous_id/session_id는 일반 이벤트 속성이며
PostHog의 distinct_id/예약 속성 `$session_id`를 덮어쓰지 않습니다.

## 이벤트 사양

모든 커스텀 이벤트에는 anonymous_id, session_id, test_version, 최초 유입 5개 속성,
device_type을 붙입니다. 시도 안의 이벤트에는 명시적으로 그 시도의 attempt_id를 전달합니다.
랜딩·CTA에는 아직 새 시도가 없으므로 attempt_id를 붙이지 않습니다.
question_index, from/to_question_index, display_position은 모두 **1부터 시작**합니다.

| 이벤트 | 연결 위치 / 의미 | 추가 속성 및 중복 규칙 |
| --- | --- | --- |
| landing_view | LandingContent 마운트 effect | session당 1회, 새로고침·Strict Mode·재방문 억제 |
| cta_click | 랜딩의 테스트 시작하기 Link 클릭 | 클릭마다 1회, 기존 진행이 있으면 원래 복구 화면으로 이동 |
| test_start | TestRunner.startNew의 기존 새 시도 저장 성공 직후 | attempt당 1회, is_retry. 복구 시 과거 start를 소급 전송하지 않음 |
| question_view | TestRunner에서 질문이 실제 표시되는 effect | question_id/index/total_questions. 같은 attempt+문항의 재렌더는 억제, 이전으로 재방문·확인창 취소 후 재표시는 새 view |
| question_answer | 유효한 선택지 클릭 handler | question_id/index, answer_id, display_position/label, answer_saved. 클릭당 1회, 같은 답 재클릭도 포함 |
| answer_change | 다른 답으로 실제 저장에 성공 | question_id/index, previous_answer_id/new_answer_id. 첫 선택·같은 답·저장 실패는 제외 |
| question_back | 이전 버튼으로 실제 저장·이동 성공 | from_question_index/to_question_index. 성공한 이동만 back_count 증가 |
| test_complete | 점수 계산·완료 저장·snapshot 준비 성공 후, 결과 navigation 전 | attempt당 1회. 결과 복구·새로고침에서는 호출하지 않음 |
| result_view | ResultPreview에 ready snapshot이 표시된 effect | attempt_id, main_type. 마운트 중 같은 결과는 1회, 새로고침/재방문은 새 view |
| retry_click | 결과의 다시 하기 또는 진행 중 다시 시작 **확정** 버튼 | 이전 attempt_id로 먼저 접수, 이어서 새 UUID 생성. 확인창 열기/취소는 retry가 아님 |

결과가 없거나 손상된 상태의 시작 버튼은 유효한 이전 attempt가 없으므로 retry_click을 보내지 않습니다.
진행 중 재시작은 확인을 받은 뒤 수행하고, 결과에서의 재시작은 요청 마커를 통해 `/test`에서
항상 새 attempt를 생성합니다. 완료 기록 이후 일반 `/test` 진입도 새 시도이며 is_retry=true입니다.

test_complete의 세부 속성:

- duration_seconds: 기존 completedAt − startedAt. 새로고침/자리 비움 시간 포함, 초 단위
- main_type: 기존 mainResult.id
- main_scores: 기존 mainScores 전체 복사. combat/position, frontline/support, pressure/design, risk/safe의 원점수 8개
- top_sub_tag_1 / top_sub_tag_2: 표시 태그 순서 유지, 없는 태그는 null
- answer_change_count / back_count: 저장 성공한 변경·이전 이동 횟수
- is_retry: 해당 새 시도가 재시도인지 여부

2단계 이전 시도에는 행동 횟수 기록이 없으므로 0/false에서 시작합니다. 답변 배열만 보고
과거 변경 횟수를 추측하지 않습니다. question_answer의 answer_saved=false는 클릭은 있었지만
답변 저장이 실패했음을 뜻합니다.

result_view는 결과 **조회**를 측정하므로 새로고침/재방문을 허용합니다. 결과 전환율은
test_complete 또는 result_view의 고유 attempt_id 수를 사용하세요. 단순 result_view 총합은
완료한 시도 수가 아닙니다. Strict Mode effect 재실행은 useRef로 억제합니다.

## 중복 억제와 전달의 한계

시작·완료·랜딩은 이벤트를 대기열/SDK에 넘기기 전에 sent flag를 예약합니다.
SDK 로딩 중 최대 100개 이벤트의 context와 URL은 호출 당시 값으로 보관합니다.
미설정 상태에서는 이벤트를 접수하거나 sent flag를 만들지 않습니다.

flag는 서버 수신 확인이 아닙니다. 초기화 실패·브라우저 종료·차단·오프라인에서는 이벤트가
유실될 수 있고, 새로고침으로 재전송하지 않습니다. localStorage의 읽기/쓰기는 탭 사이에서
원자적이지 않으므로 같은 시도를 여러 탭에서 동시에 조작하는 경합까지 exactly-once로
보장하지는 않습니다. 향후 Supabase 도입 시 attempt_id 기반 고유 제약과 서버 멱등성을 설계해야 합니다.

기존 `$pageview` 자동 수집은 유지합니다. 클릭 자동 수집, replay, flags, surveys, 공유 이벤트는
추가하지 않았습니다. 자동 `$pageview`는 SDK 페이지 방문 이벤트이며 위 커스텀 이벤트 사양과 별개입니다.

## 직접 확인할 시나리오

테스트용 PostHog 프로젝트 또는 개발 트래픽 필터를 사용해 실제 분석 데이터와 구분하세요.
로컬 서버를 재시작하고 Vercel 환경변수를 변경했다면 재배포합니다. 키/실제 host를 로그나 문서에 복사하지 않습니다.

1. 새 브라우저 저장소로 `/?utm_source=discord&utm_medium=social&utm_campaign=launch` 방문.
   landing_view 1회와 공통 속성을 확인하고, 새로고침/랜딩 재방문으로 추가되지 않는지 확인합니다.
2. CTA 클릭 후 cta_click → test_start → question_view 순서와 attempt_id를 확인합니다.
3. 첫 문항 A → A → B 클릭: question_answer 3개, answer_change 1개.
   표시 위치 1/A, 1/A, 2/B 및 qXX-choice-1/2가 실제 문항과 일치해야 합니다.
4. 다음 → 이전 이동: question_back의 1기준 인덱스와 재방문 question_view를 확인합니다.
5. 중간 새로고침 후 이어서 하기: 같은 attempt_id/session_id, 새 test_start 없음, 이전 답변 복원.
6. 24문항 완료: test_complete 1개와 duration/main_scores/태그/횟수 확인, result_view 1개.
7. 결과 새로고침: 같은 attempt_id로 result_view만 추가, test_complete는 추가되지 않음.
8. 결과 다시 하기: 이전 attempt의 retry_click 후 새 attempt의 test_start, is_retry=true, 빈 답변으로 시작.
9. 진행 중 재시작 확인창: 취소는 retry 없음, 확정 시 이전 ID의 retry_click과 새 ID의 test_start.
10. 다른 UTM으로 재진입해도 최초 유입 유지. 새 탭의 새 저장소에서는 session_id만 변경.
11. PostHog 요청 차단 또는 환경변수 미설정: 답변·복원·결과 표시 정상. SDK 오류가 앱 오류로 전파되지 않음.
12. 공유 이벤트, `$autocapture`, `$snapshot`, flags 요청이 없고 query/hash의 임의 값이 전송되지 않는지 확인.

자동 테스트는 실제 자격 증명이나 네트워크 전송을 사용하지 않습니다. 실제 프로젝트 수신과
브라우저 전체 동작은 위 시나리오로 확인해야 합니다.
