# Supabase DB 1단계

DB 1단계 스키마에 서버 연결·token helper와 POST /api/attempts/start를 추가했다.
공식 @supabase/supabase-js SDK와 server-only를 사용한다. 앱 연결 2단계에서 TestRunner의
새 시작을 API에 연결했다. 환경변수 변경, 원격 migration 실행은 포함하지 않는다.
질문/점수/결과 계산과 기존 testProgress/resultSnapshot 형식은 유지한다.

## 앱 연결 2단계: 시작 및 복구

랜딩 CTA는 기존처럼 `/test`로 이동한다. TestRunner의 `startNew`가
`src/lib/startDatabaseAttempt.ts`의 `startDatabaseAttempt(isRetry)`를 호출한다.
visitorContext에서 최초 유입/방문자/세션 정보를 가져오고 questionSet/QUESTION_ORDER_KEY를
재사용한다. 서버 성공 응답의 attempt_id로 createAttempt를 호출하며 클라이언트 UUID를
따로 생성하지 않는다. credential과 진행 저장이 성공한 뒤 test_start를 보내고 문항을 연다.
이후 question_view, 로컬 완료와 resultSnapshot도 이 ID를 그대로 사용한다.

`src/lib/attemptCredentials.ts`는 localStorage의 `pubg-playstyle-test:db-credential:v1`에
`{ attemptId, writeToken, startedAt }`를 저장한다. 현재 시도 한 개만 유지하며 새 시도 저장 시
교체한다. localStorage를 선택한 이유는 진행 상태도 같은 저장소에서 탭/새로고침을 넘어
24시간 동안 복구하기 때문이다. credential을 progress/result/analytics 객체에 넣지 않는다.
복구 시 token/UUID 형식, 진행 ID와 시작 시각 일치, 진행 유효기간을 확인한다. 24시간이 지난
credential은 복구에 사용할 수 없지만 저장된 문자열은 다음 시작의 교체 또는 브라우저 데이터
삭제 전까지 남을 수 있다. 이는 서버 token 만료를 구현한 것이 아니다.

유효한 진행+credential은 이어하기 화면(답변이 없으면 바로 Q1)으로 복구하며 start API나 test_start를 다시 호출하지
않는다. 기존 로컬 전용 진행 또는 credential 유실/불일치는 자동 업로드나 ID 교체 없이
새 시작 버튼을 안내한다. 기존 완료 결과의 로컬 조회는 그대로 유지한다.

모듈 단위 in-flight Promise가 같은 페이지의 중복 요청과 컴포넌트 재마운트를 묶고,
컴포넌트 ref 잠금과 disabled 버튼이 빠른 연속 클릭을 막는다. Strict Mode effect 정리도 유지한다.
DB 시작은 필수이며 실패하면 첫 문항으로 진입하지 않는다. UI에는 고정 오류 안내만 표시하고
자동 재시도는 하지 않는다. 발급 후 저장 실패는 진행 저장을 commit 지점으로 취급하고
이전 credential을 복원한다. 같은 페이지의 수동 재시도는 메모리에 보유한 발급 결과를 재사용한다.
Analytics 장애는 시작 API 성공 여부와 분리된다.

현재 start API 자체에는 멱등성 키가 없다. 응답 유실/요청 중 새로고침, 발급 후 저장 실패 상태에서
페이지를 닫은 뒤 새로 시작, 서로 다른 탭의 동시 시작까지 한 행으로 보장하지 않는다.
이 경우 서버에 사용되지 않은 행이 남을 수 있다. 자동 재전송으로 이를 숨기지 않는다.
완전한 보장을 위해서는 별도 서버 멱등성 계약이 필요하다.

기존 다시 시작 버튼은 같은 helper의 is_retry=true를 사용한다. 답변 DB 저장은 아래 단계에서
추가했다. 완료 API는 [완료 API 문서](complete-api.md)를 참고한다.
결과 페이지의 DB retry 흐름은 [Retry 문서](retry-flow.md)를 참고한다.
선택지 랜덤화와 공유 기능은 포함하지 않는다.

## 앱 연결 3단계: 답변 저장

**배포 전 `supabase/migrations/002_save_attempt_answer.sql`을 001이 적용된 DB에 적용한다.**
이 migration은 last_question_index의 의미를 바꾸고 service_role 전용 RPC를 추가한다.
001을 다시 실행하지 않는다. 2단계까지 생성된 행의 값은 0이므로 기존 시작 행은 그대로 쓴다.
별도로 기존 답변 데이터를 입력했다면 그 데이터의 화면 순서 기준 인덱스를 점검해야 한다.
이번 작업에서 원격 migration은 실행하지 않았다.

`POST /api/attempts/[attemptId]/answers`, Content-Type은 application/json이다.

```json
{
  "write_token": "<발급받은 token>",
  "question_id": "q01",
  "answer_id": "q01-choice-1",
  "question_index": 1
}
```

4개 필드만 허용한다. params는 현재 Next.js 규약대로 await한다. UUID v4와 body 형식을
검사한 뒤 실제 orderedQuestions(questions.ts의 데이터를 화면 순서로 정렬한 배열)에서
질문·선택지 소속·정확한 1-based index를 검증한다. q16은 화면 2번이지 16번이 아니다.
서버는 해당 attempt의 hash를 조회하고 기존 SHA-256/timingSafeEqual helper로 token을 검증한다.
완료 상태나 현재 버전/질문 순서와 다른 시도는 409로 거부한다.

성공은 200 `{ "saved": true, "last_question_index": 1 }`이다. 오류는 고정 error 코드만 반환한다.
잘못된 UUID/body/문항/선택지/index는 400, 없는 attempt는 404, token 불일치는 403,
완료/버전 불일치는 409, DB/설정/네트워크 문제는 500이다. 비JSON Content-Type은 415다.
모든 응답은 no-store이며 token/hash/key/DB 오류 원문을 반환하거나 로그로 출력하지 않는다.

`save_attempt_answer` RPC 한 번으로 답변과 최고 문항 번호를 함께 저장한다. 함수는
SECURITY INVOKER, 빈 search_path이며 PUBLIC/anon/authenticated 실행 권한을 회수한다.
부모 attempt를 FOR UPDATE로 잠근 다음 hash·완료·버전을 다시 확인한다. 원본 token은 DB에
전달하지 않는다. answers의 `(attempt_id, question_id)` 충돌 시 answer_id와 answered_at만
교체하며 created_at은 보존한다. answered_at은 DB clock_timestamp(), updated_at은 기존
트리거를 사용한다. 부모 갱신 실패 시 답변도 rollback된다.

last_question_index는 **저장 성공한 가장 높은 1-based 문항 번호**다. 0은 아직 저장 없음,
Q1은 1, Q5는 5이며 Q3 재수정 후에도 5다. DB의 GREATEST와 부모 행 잠금으로 동시 답변 요청에도
감소하지 않는다. 로컬 currentQuestionIndex는 기존대로 0-based 현재 화면 위치이며 별개다.

TestRunner는 선택을 로컬에 먼저 저장하고 기존 question_answer/answer_change를 기록한 뒤
다음 문항으로 즉시 이동하고 백그라운드 큐에서 DB에 저장한다. 로컬 변경이 실패하면 DB를 호출하지 않는다.
DB 저장 중에도 선택·이동·재시작이 가능하다. 실패 시 안내와 재시도 버튼을 표시하고 테스트 진행은 허용한다.
최종 완료는 미저장 답변이 남아 있으면 차단한다. 수동 저장 재시도는
클릭 이벤트를 다시 기록하지 않는다. analytics answer_saved는 로컬 저장 성공 의미를 유지한다.

`pubg-playstyle-test:answer-sync:v1`에는 `{ attemptId, answers: { questionId: choiceId } }` 형태의
서버 저장 확인 기록만 둔다. token은 없다. 선택 시 해당 문항의 확인을 먼저 해제하고 DB 200
확인 후 기록한다. 저장 실패·새로고침·이전 버전의 로컬 전용 답변은 이 기록과 비교해 미저장을
찾는다. 이어하기에서 원래 credential로 미저장 답변을 백그라운드 재동기화하며 start API를 재호출하지 않는다.
attempt별 최신 로컬 답변 스냅샷과 확인 기록의 차이가 pending 큐다. 한 요청이 성공한 후
최신 스냅샷을 다시 읽고 다음 미저장 답변을 전송한다. 아직 전송하지 않은 같은 문항의 변경은
최신 답변으로 합친다. 실패하면 큐를 멈추고 최신 로컬 답은 계속 갱신하며, 명시적 저장 재시도/
이어하기/최종 결과 보기에서 다시 전송한다. 정상 저장 중에는 별도 진행 안내를 표시하지 않는다.
새 attempt commit 후 이전 큐는 폐기하며 이미 보낸 요청의 응답은 새 확인 기록이나 UI를 갱신하지 않는다.

서로 다른 탭이나 네트워크 timeout 뒤 늦게 도착한 요청까지 사용자의 클릭 시간순으로 정렬하는
revision 계약은 이번에 추가하지 않았다. 같은 문항의 서버 최종 답은 마지막 DB 쓰기를 따른다.
재전송은 row를 추가하지 않지만 answered_at/updated_at을 갱신할 수 있다.
003 migration 적용 후 complete API가 성공하면 DB is_completed도 true가 된다.

### 답변 저장 QA (개발 DB)

1. migration 002 적용 후 앱에서 새 시도를 시작하고 Network의 attempt_id를 기록한다.
2. Q1 선택 시 answers에 그 attempt_id/q01 한 행, 부모 last_question_index=1인지 확인한다.
3. 같은 답 재클릭 및 다른 답 선택 시 행 수가 그대로이고 answer_id/answered_at/updated_at이
   갱신되며 created_at은 유지되는지 확인한다.
4. 화면 Q5까지 답하고 Q3으로 돌아가 수정한다. 부모 값은 5를 유지해야 한다.
5. 새로고침 후 이어하기로 다른 답을 선택한다. 기존 attempt_id이며 start POST가 없어야 한다.
6. DevTools Request blocking으로 `/api/attempts/*/answers`를 막고 답을 바꾼다. 로컬 선택은
   남고 오류/재시도 UI가 나오며 다음 문항을 계속 답할 수 있어야 한다. 완료 API는 호출되지 않아야 한다. 새로고침해도 미저장 상태가
   감지되어야 한다. 차단 해제 후 저장 재시도로 기존 행이 갱신되는지 확인한다.
7. 개발용 API 요청에서 잘못된 token은 403, 다른 질문의 answer_id/잘못된 화면 index는 400,
   없는 UUID는 404인지 확인한다. 실제 token을 URL·console·공유 자료에 붙여 넣지 않는다.
8. 24개 답변 후 로컬 결과가 정상이고 DB answers는 24행, last_question_index=24,
   큐 drain 전에는 is_completed=false, 완료 API 성공 후에는 true인지 확인한다. PostHog payload에 token이 없어야 한다.

answerApi.test.mjs는 실제 SDK와 가짜 DB 전송으로 API 계약을 검증하고 migration을 정적으로
검사한다. syncDatabaseAnswers.test.mjs는 실제 TestRunner handler와 가짜 fetch로 복구/실패를
검증한다. 이 테스트 결과는 실제 PostgreSQL transaction/권한/동시 실행 검증을 대신하지 않는다.

### 직접 확인할 QA

1. 개발 서버를 실행하고 새 브라우저 프로필에서 랜딩 CTA를 누른다. Network의
   `/api/attempts/start` POST가 한 번이고 201인지 확인한다.
2. 응답의 attempt_id와 localStorage의 `pubg-playstyle-test:attempt`의 attemptId,
   Supabase Table Editor `test_attempts.id`, PostHog test_start의 attempt_id가 같은지 확인한다.
   credential 키에는 같은 ID와 token이 존재하되 실제 token을 복사하거나 로그로 출력하지 않는다.
3. Table Editor에서 write_token_hash만 저장되고 started_at, is_completed=false,
   last_question_index=0 및 최초 유입 값이 맞는지 확인한다.
4. 답변 후 새로고침하고 이어하기를 누른다. 기존 답/ID를 복구하고 start POST와 DB 행이
   추가되지 않는지 확인한다. PostHog test_start도 추가되지 않아야 한다.
5. 느린 네트워크에서 다시 시작 확인 버튼을 빠르게 두 번 누른다. 요청 중 버튼이 비활성이고
   POST 한 번, 새 행 한 개인지 확인한다.
6. 새 프로필에서 /test로 이동하기 전에 DevTools Request blocking으로 start 경로를 차단한다.
   오류 안내만 나오고 새 진행 저장/첫 문항이 없는지 확인한다. 차단 해제 후 수동 재시도가
   성공하는지 확인한다. 반복 자동 요청이 없어야 한다.
7. 진행을 남긴 상태에서 credential 키만 삭제하고 새로고침한다. 자동 새 POST 없이
   새 시작 안내가 나와야 한다. 명시적으로 새 시작 시 새 서버 ID를 사용해야 한다.
8. PostHog 전송 payload, 주소창, DOM, console에 token이 없는지 확인한다.
   완료까지 진행해 결과를 확인한다. complete API 성공 후에는 DB 행이 완료 상태로
   last_question_index=24, answers 24행이 있어야 한다.

## 시도 생성 API 검증

`POST /api/attempts/start`는 `Content-Type: application/json`을 받는다.
아래 10개 필드는 모두 필수이며 추가 필드는 400으로 거부한다.

| 필드 | 검증 |
| --- | --- |
| anonymous_id, session_id | UUID v4, 대소문자 허용, 공백 불가 |
| test_version | 현재 questionSet.version과 일치 (`v1`) |
| question_order_key | src/data/questionOrder.ts의 QUESTION_ORDER_KEY와 정확히 일치 |
| initial_source, initial_medium | 영문·숫자·점·밑줄·물결표·하이픈 1~120자 |
| initial_campaign | 같은 slug 규칙 또는 빈 문자열 |
| initial_referrer | origin만, 최대 2048자. 빈 문자열과 opaque origin인 `"null"` 허용 |
| landing_page | `/`로 시작하는 정규화된 pathname, 최대 2048자. query/hash/공백/역슬래시 불가 |
| is_retry | JSON boolean |

서버에서 UUID v4와 32바이트 랜덤 write token을 새로 생성한다.
`test_attempts` insert는 위 10개 검증된 필드를 하나씩 명시하고,
`id`, `write_token_hash`(원본 token 문자열의 SHA-256 hex),
`started_at`(서버 UTC ISO 시각), `is_completed: false`, `last_question_index: 0`을 추가한다.
클라이언트 body spread와 DB row SELECT는 사용하지 않는다. 나머지 DB 컬럼은 SQL 기본값/NULL을 사용한다.

성공 응답은 HTTP 201과 `{ "attempt_id": "<서버 UUID>", "write_token": "<발급 token>" }`뿐이다.
누락·형식 오류·잘못된 JSON은 400 `INVALID_REQUEST`, JSON이 아닌 Content-Type은
415 `UNSUPPORTED_MEDIA_TYPE`, DB/설정/네트워크 오류는 500 `ATTEMPT_START_FAILED`다.
모든 응답은 `Cache-Control: no-store`를 사용한다. hash, 서버 key/secret, DB 오류 원문,
stack은 반환하지 않으며 원본 token을 포함한 로그 출력도 없다.

DB 요청에는 10초 timeout과 `.retry(false)`를 적용한다. 이 API는 멱등하지 않으며
반복 호출마다 새 시도를 만든다. 응답 유실 후 재호출하면 별도 행이 생길 수 있다.
TestRunner 연결은 위 앱 연결 2단계, 답변 저장은 3단계에 기술했다.
complete API는 003 migration과 함께 구현했다. 상세 계약과 QA는 [완료 API 문서](complete-api.md)를 참고한다.
결과 페이지의 retry DB 연결은 [Retry 문서](retry-flow.md)에 설명한다.

`tests/startAttempt.test.mjs`는 입력/응답/insert/오류와 실제 SDK의 요청 구성을 검증한다.
SDK 전송은 가짜 fetch로 대체하며 실제 원격 DB 저장이나 배포 환경 권한을 증명하지 않는다.

## 서버 연결 계층 (앱 연결 1단계)

- `src/lib/server/supabaseAdmin.ts`: `createSupabaseAdmin()` 호출 시 SDK client를 생성한다.
  기존 DB row/insert/update 타입을 참조하는 최소 SDK 스키마 타입을 이 서버 모듈에 둔다.
  사용자 Auth 세션 저장·자동 갱신·URL 세션 감지를 모두 끈다. 사용자 쿠키나 Authorization
  헤더를 이 admin client에 주입하거나 auth.signIn/setSession을 호출하지 않는다.
- `src/lib/server/supabaseEnv.ts`: 함수 호출 시에만 SUPABASE_URL과
  SUPABASE_SERVICE_ROLE_KEY를 읽는다. 후자에는 서버용 Secret key 또는 기존 service_role
  key를 설정한다. JWT 형태만 강제하지 않으며 키의 실제 권한/유효성은 향후 DB 요청에서 확인된다.
  빈 값은 변수 이름만 포함한 명확한 오류를 던진다. URL은 HTTPS origin을 허용하고
  로컬 개발용 localhost/127.0.0.1/::1에만 HTTP를 허용한다. 사용자정보/query/hash/추가 경로는
  거부한다. URL 파서 및 SDK 초기화 오류의 원문/cause는 노출하지 않는다.
- `src/lib/server/writeToken.ts`: Node crypto 기반 generateWriteToken/hashWriteToken/
  verifyWriteToken을 제공한다. 생성은 randomBytes(32)의 base64url 43자리 문자열,
  해시는 원본 문자열 UTF-8의 SHA-256 소문자 hex 64자리다. 검증은 token의 canonical
  base64url 형식과 hash 길이/형식을 먼저 검사한 뒤 32바이트끼리 timingSafeEqual로 비교한다.
  malformed 입력은 false다. 형식이 잘못된 입력의 전체 실행 시간까지 일정하게 만들지는 않는다.

세 모듈 모두 `import "server-only"`를 선언해 Client Component에서 직접 또는 간접으로
import하면 Next.js가 빌드 오류를 내도록 한다. NEXT_PUBLIC_ 환경변수는 사용하지 않는다.
모듈 import 시 환경변수를 읽거나 client를 생성하지 않으므로 연결을 사용하지 않는 페이지는
DB 환경변수 누락 때문에 깨지지 않는다. 다음 Route Handler는 Node.js runtime을 사용한다.
SDK client 생성만으로 DB 연결 성공이나 권한 검증이 완료되는 것은 아니다.
향후 요청 실패 응답도 서버에서 정제하고 key/token/hash/SDK 오류 원문을 반환·기록하지 않는다.

API 응답은 허용 필드를 명시적으로 구성한다. server-only는 서버가 직접 반환한 secret을
자동 삭제하지 않으므로 DB row/client/env 객체를 브라우저에 직렬화하지 않는다.
원본 token은 DB 타입에 없으며 향후 전용 발급 DTO 또는 쿠키 전달 경로에서만 다룬다.

SDK 설정 근거: [Supabase JavaScript 초기화](https://supabase.com/docs/reference/javascript/initializing).

## 적용 파일

Supabase SQL Editor에서 `supabase/migrations/001_create_test_tables.sql` 전체를
관리자 권한으로 한 번 실행한다. 트랜잭션으로 묶여 있으며 실패하면 전체 rollback된다.
재실행용 스크립트가 아니므로 이미 적용한 DB에는 반복 실행하지 않는다.
추후 변경은 별도 migration으로 추가한다. Supabase 기본 역할인 anon/authenticated/
service_role이 필요하다. 일반 Postgres에서는 해당 역할을 먼저 준비해야 한다.

## test_attempts 전체 컬럼

`?`는 NULL 허용이다. 기본값이 없는 필수 컬럼은 서버에서 전달한다.

| 컬럼 | PostgreSQL 타입 / 기본값 | 의미 및 앱·PostHog 매핑 |
| --- | --- | --- |
| id | UUID PK | start API가 서버에서 생성. TestProgress/이벤트 attempt_id로 사용, DB 생성 없음 |
| write_token_hash | TEXT NOT NULL, 기본값 없음 | 서버 전용. attempt별 랜덤 write token의 SHA-256 소문자 64자리 hex. Analytics 매핑 없음, 원본 token 저장 금지 |
| anonymous_id | UUID | VisitorContext.anonymous_id. localStorage 방문자 식별자, 인증 수단 아님 |
| session_id | UUID | VisitorContext.session_id. 시도 시작 때 sessionStorage의 세션 값 |
| test_version | TEXT | attempt.testVersion = 이벤트 test_version = 해당 questionSet.version |
| question_order_key | TEXT | 추가 컬럼. attempt.questionOrderKey, 화면 순서 식별용. 현재 PostHog 전송 없음 |
| initial_source | TEXT | 최초 utm_source. 없거나 유효하지 않으면 direct |
| initial_medium | TEXT | 최초 utm_medium. 없거나 유효하지 않으면 none |
| initial_campaign | TEXT | 최초 유효한 utm_campaign. 없으면 빈 문자열 |
| initial_referrer | TEXT | 최초 referrer의 origin만. 없으면 빈 문자열 |
| landing_page | TEXT | 최초 진입 pathname. query/hash 제외 |
| started_at | TIMESTAMPTZ | attempt.startedAt. 최초 시도 시작 시각 |
| completed_at | TIMESTAMPTZ? | 최초 DB 완료 트랜잭션의 clock_timestamp() |
| is_completed | BOOLEAN / false | status가 completed인지 여부 |
| is_retry | BOOLEAN / false | getAttemptMetrics(attemptId).is_retry = Analytics 의미 그대로 |
| duration_seconds | NUMERIC(14,3)? | DB completed_at − started_at의 초를 소수 셋째 자리로 반올림. PostHog에도 이 값을 사용 |
| last_question_index | INTEGER / 0 | 저장 성공한 가장 높은 1-based 문항 번호. 0은 저장 없음. 뒤로 가서 수정해도 감소하지 않음 |
| main_type | TEXT? | result.mainResult.id = 이벤트 main_type. 표시 이름이 아닌 기존 ResultId |
| combat_score | INTEGER? | result.mainScores.combat = 이벤트 main_scores.combat |
| position_score | INTEGER? | result.mainScores.position = 이벤트 main_scores.position |
| frontline_score | INTEGER? | result.mainScores.frontline = 이벤트 main_scores.frontline |
| support_score | INTEGER? | result.mainScores.support = 이벤트 main_scores.support |
| pressure_score | INTEGER? | result.mainScores.pressure = 이벤트 main_scores.pressure |
| design_score | INTEGER? | result.mainScores.design = 이벤트 main_scores.design |
| risk_score | INTEGER? | result.mainScores.risk = 이벤트 main_scores.risk |
| safe_score | INTEGER? | result.mainScores.safe = 이벤트 main_scores.safe |
| main_body_score | INTEGER? | result.subScores.mainBody |
| flank_score | INTEGER? | result.subScores.flank |
| hotdrop_score | INTEGER? | result.subScores.hotdrop |
| tail_score | INTEGER? | result.subScores.tail |
| full_loot_score | INTEGER? | result.subScores.fullLoot |
| fast_loot_score | INTEGER? | result.subScores.fastLoot |
| center_score | INTEGER? | result.subScores.center |
| edge_score | INTEGER? | result.subScores.edge |
| standard_gear_score | INTEGER? | result.subScores.standardGear |
| special_gear_score | INTEGER? | result.subScores.specialGear |
| top_sub_tag_1 | TEXT? | displaySubTags[0] ?? null = 이벤트 top_sub_tag_1 |
| top_sub_tag_2 | TEXT? | displaySubTags[1] ?? null = 이벤트 top_sub_tag_2 |
| answer_change_count | INTEGER / 0 | getAttemptMetrics의 동명 값. 실제 저장된 다른 답으로 변경한 횟수 |
| back_count | INTEGER / 0 | getAttemptMetrics의 동명 값. 실제 저장·이동에 성공한 이전 이동 횟수 |
| created_at | TIMESTAMPTZ / now() | DB row 최초 생성 시각. started_at과 다를 수 있음 |
| updated_at | TIMESTAMPTZ / now() | DB UPDATE 트리거가 갱신하는 시각 |

보조 raw score는 현재 PostHog 이벤트에 없으며 DB 전용으로 추가 저장한다.
태그는 기존 표시 문자열(올라운더 포함)을 그대로 저장한다. 두 번째 태그는 없을 수 있다.
점수는 퍼센트가 아니다. 현재 v1 24문항에서 각 메인 성향의 최대 합은 5,
보조 성향은 mainBody/flank/hotdrop/tail/fullLoot/fastLoot/specialGear가 2,
center/edge/standardGear가 1이다. INTEGER 최대 2,147,483,647로 충분하다.
버전 확장을 위해 이 작은 최대값이나 특정 결과/질문 목록을 SQL에 고정하지 않는다.

초기 유입 5개 필드는 VisitorContext의 문자열을 동일하게 사용한다. 빈 문자열을 NULL로
바꾸지 않는다. UTM은 영문·숫자·점·밑줄·물결표·하이픈 1~120자 정책을 서버에서도 검증한다.
시도 시작 context를 고정하고 재개할 때 덮어쓰지 않는다. 다른 탭에서 재개하면 이벤트의
session_id는 현재 탭 값이고 DB session_id는 시작 세션 값이다. SDK distinct_id나
예약 속성 $session_id와 혼동하지 않는다. device_type은 이번 DB에 저장하지 않는다.

PostHog question_index/from_question_index/to_question_index는 1부터 시작한다.
DB last_question_index는 저장 성공한 question_index의 최댓값이다. v1의 모든 답 저장 시 24다.
question_order_key는 question ID들을 실제 화면 순서대로 연결한 현재 키를 저장한다.

## answers 전체 컬럼

| 컬럼 | 타입 / 기본값 | 의미 |
| --- | --- | --- |
| attempt_id | UUID, 필수 | test_attempts.id FK. 이벤트 attempt_id와 동일 |
| question_id | TEXT, 필수 | TestAnswer.questionId = 이벤트 question_id. 예: q01 |
| answer_id | TEXT, 필수 | TestAnswer.choiceId = 이벤트 answer_id. 예: q01-choice-1. A/B 표시 라벨 아님 |
| answered_at | TIMESTAMPTZ, 필수 | 최신 답을 실제로 선택·저장한 시각. 변경 시 갱신, 네트워크 재전송 시 유지 |
| created_at | TIMESTAMPTZ / now() | 답변 row 최초 생성 시각, upsert UPDATE에서는 보존 |
| updated_at | TIMESTAMPTZ / now() | DB UPDATE 트리거 갱신 시각 |

별도 id 없이 PRIMARY KEY(attempt_id, question_id)를 사용한다. PK가 UNIQUE와 NOT NULL을
함께 보장하므로 UNIQUE를 중복 선언하지 않는다. FK는 ON DELETE CASCADE이며 관리자에
의한 attempt 삭제 시 답도 삭제된다. MVP 앱에는 삭제 권한/경로를 제공하지 않는다.
같은 문항의 답 변경은 이 복합키로 upsert한다. 답변 변경 이력 테이블은 아니다.
기존 TestAnswer에는 answeredAt이 없으므로 다음 단계 writer에서 별도로 수집해야 한다.
과거 복구 데이터에 실제 선택 시각이 없으면 임의로 started_at을 넣지 말고,
복구 수신 시각을 쓰는지/과거 시도 업로드를 제외할지 제품 정책을 정해야 한다.

## 제약조건과 인덱스

인덱스는 attempts PK 외 anonymous_id, test_version, created_at, initial_source 각각과
완료 행만 포함하는 created_at 부분 인덱스(WHERE is_completed = true)를 둔다.
선택도가 낮은 is_completed 단독 인덱스 대신 완료 데이터의 기간 분석을 지원한다.
answers 복합 PK의 선두 attempt_id가 조회/FK 삭제/upsert를 지원하므로 별도 인덱스는 없다.

빈 question_id/answer_id/test_version/question_order_key/main_type을 거부한다.
점수, 횟수, 인덱스, 시간은 음수를 거부하며 duration의 NaN도 거부한다.
완료 행은 completed_at >= started_at, duration, main_type, 18개 raw score가 필수다.
미완료 행은 completed_at/duration이 NULL이다. 점수 NULL은 아직 미계산, 0은 실제 0점이다.
정확한 버전별 질문/선택지/결과 조합, 시간 계산 일치, 전체 답변 수, 완료 후 변경 금지는
다음 단계 서버 검증/트랜잭션 책임이다. SQL CHECK만으로 테이블 간 완결성을 보장하지 않는다.

## 접근 방식 및 RLS

**B: Next.js Route Handler를 통한 서버 쓰기를 선택한다.**

| 방식 | 보안과 구현 비용 |
| --- | --- |
| A: 브라우저 직접 쓰기 | anonymous_id 문자열은 위조 가능. 안전한 소유권에는 별도 Auth/토큰 체계가 필요하고 UPDATE/upsert의 SELECT 정책도 설계해야 함 |
| B: 서버 API | 브라우저 DB 권한 없이 서버에서 소유권·버전·점수를 함께 검증 가능. 작은 API와 소유권 검증은 다음 단계에 필요 |

두 테이블의 RLS를 켜고 허용 정책은 **0개**로 둔다. PUBLIC, anon, authenticated의
테이블 권한을 모두 회수한다. 따라서 브라우저 SELECT/INSERT/UPDATE/DELETE는 전부 차단한다.
service_role에는 SELECT/INSERT/UPDATE만 명시적으로 부여하며 DELETE는 부여하지 않는다.
트리거는 SECURITY INVOKER이고 빈 search_path를 사용하며 공개 EXECUTE 권한을 회수한다.
이 migration은 다른 테이블/역할의 전역 기본 권한을 변경하지 않는다.

service_role은 RLS를 우회한다. attempt_id UUID, anonymous_id, session_id는 소유권 증명이
아니다. 다음 API는 아래의 attempt별 랜덤 write token을 검증한 뒤에만 쓰기를 허용한다.
기존 서명 토큰 제안은 이 랜덤 토큰+DB 해시 비교 방식으로 대체한다.

### Write token 생성 → hash 저장 → 검증 (helper 구현 완료, API 연결은 다음 단계)

1. 서버가 attempt마다 CSPRNG로 독립적인 32바이트(256비트) 랜덤 값을 생성하고
   base64url 문자열로 인코딩한다. Math.random(), attempt_id/분석 ID에서 파생한 값은 사용하지 않는다.
2. 원본 token 문자열의 UTF-8 바이트를 SHA-256으로 해시하고 소문자 hex 64자리로 저장한다.
   test_attempts insert에 write_token_hash를 필수로 전달한다. SQL CHECK는 이 형식만 검증하며
   랜덤성이나 실제 해시 계산은 서버 책임이다. 원본 token과 클라이언트가 제출한 hash는 DB에 저장하지 않는다.
3. 생성 성공 후 원본 token은 해당 브라우저에만 HTTPS로 전달한다. 기본 전달/보관안은
   서버가 설정하는 attempt별 HttpOnly/Secure/SameSite 쿠키다. 이는 서명 토큰이 아닌 원본
   랜덤 token이며 이후 요청의 attempt_id와 함께 서버로 전달된다. JS가 직접 전달해야 하는
   방식을 선택하면 전용 생성 응답과 요청 헤더/본문만 사용하고 보관·XSS 대책을 먼저 정한다.
4. answer upsert, attempt update, 완료, 기존 시도 재개 요청마다 attempt_id로 서버에서
   저장 hash를 조회하고, 전달된 원본 token을 같은 방식으로 해시해 고정 길이 바이트의
   timing-safe 비교로 확인한다. 원본 token 대신 hash를 보내는 요청은 인증하지 않는다.
   누락·잘못된 형식·불일치·없는 attempt는 쓰기 없이 거부한다. 모든 답변 변경은 검증한
   부모 attempt_id로 범위를 제한하며 별도 payload의 다른 attempt_id를 신뢰하지 않는다.
5. retry는 새 UUID와 새 token/hash를 만든다. 기존 시도의 hash를 덮어쓰지 않는다.
   token 분실이나 기존 ID 충돌 시 UUID만으로 token을 재발급하거나 소유권을 복구하지 않는다.
   DB에 hash만 있으므로 최초 생성 응답 유실 후 원본을 복원할 수 없다. token 없는 생성
   재요청은 기존 행을 인수하지 않으며 새 시도로 재시작하는 복구 UX를 다음 단계에 정한다.

원본 token은 bearer credential로, 보유한 사람은 해당 시도의 쓰기 권한을 가진다.
브라우저 저장 정책은 새로고침·여러 탭·여러 시도를 고려해 분리하고 기존 testProgress나
visitorContext/analytics sidecar에 섞지 않는다. 완료 후 일반 쓰기는 거부한다.
현재 별도 만료 컬럼은 없으므로 해시 자체에 만료 기능은 없다. 다음 API가 기존 시도 수명과
완료 상태를 검사해야 한다. Origin/CSRF 검사, 요청 크기·빈도 제한도 서버에서 처리한다.

원본 token은 다음 위치에 **절대 포함하지 않는다**. hash도 동일하게 비공개로 취급한다.

- PostHog event properties 및 analytics context
- URL query, 경로, fragment 또는 공유 링크
- Supabase 공개 응답, 일반 API 응답의 DB row 직렬화
- console/log, 요청·응답 로깅, 오류 추적 payload
- README 예제의 실제 값, 문서·fixture·소스에 하드코딩한 실제 값

원본의 전달은 위의 해당 브라우저 전용 발급 경로로 한정한다. 서버에서 응답 필드를
명시적으로 허용하고 DB row를 그대로 반환하지 않는다. service_role의 테이블 접근 권한이
있어도 write_token_hash를 브라우저에 공개할 이유는 없다. 현재 start API는 위 전용 JSON 응답으로 발급한다.

키는 향후 서버 전용 모듈의 SUPABASE_SERVICE_ROLE_KEY 환경변수로만 읽는다.
NEXT_PUBLIC_ 접두어, 클라이언트 컴포넌트, 응답/로그/문서에 키 값을 넣지 않는다.
이번에는 키나 실제 Supabase URL을 추가하지 않는다.

근거: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[데이터 보안 및 역할 권한](https://supabase.com/docs/guides/database/secure-data).
Next.js는 설치된 node_modules/next/dist/docs의 Route Handlers와 Environment Variables
가이드를 확인했다.

## TypeScript 계약

src/types/database.ts는 수동 관리하는 DB 전송 타입이며 Supabase 생성 Database 타입은 아니다.
TestAttemptRow/AnswerRow는 조회된 전체 row, TestAttemptInsert는 기본값 없는 context를 필수로,
TestAttemptUpdate는 변경 가능한 진행/결과만 선택적으로, AnswerUpsert는 복합키+답+시각을
필수로 받는다. DB 관리 created_at/updated_at은 쓰기 타입에서 제외한다.
write_token_hash는 TestAttemptRow와 TestAttemptInsert에 필수 string으로만 존재한다.
TestAttemptUpdate와 답변 타입에는 포함하지 않으며 원본 write token은 모든 DB 타입에서 제외한다.
이 해시는 AttemptContext/VisitorContext와 분리된 서버 내부 값이다. DB 쓰기 타입을 API 입력
타입으로 그대로 사용하지 말고 서버가 생성한 hash만 insert한다. 일반 update로 hash를 교체하지 않는다.
VisitorContext/TestProgress/MainScores/SubScores/ScoringResult의 기존 타입을 import type으로
재사용하며 결과 ID union이나 scoring 로직을 복제하지 않는다.
UUID/ISO 시각은 string, INTEGER/NUMERIC은 PostgREST JSON 기준 number다.
직접 Postgres 드라이버를 쓰면 NUMERIC 문자열 반환 여부를 확인해야 한다.
타입은 런타임 검증이나 완료 payload의 원자성을 대신하지 않는다.

## 다음 단계 상태 전이와 중복 방지

1. test_start: start API가 반환한 서버 UUID를 로컬 시도 및 이벤트 ID로 사용한다.
   현재 start는 호출마다 새 행을 생성하므로 같은 성공을 반환하는 중복 요청 처리는 미구현이다.
   진행과 credential을 함께 복구한다. DB started_at은 서버 시각이고 현재 로컬 startedAt은
   성공 응답 수신 시각이다. 완료 duration은 DB 시작/완료 시각을 기준으로 확정한다.
2. 답변 저장: answers upsert와 last_question_index 최댓값을 RPC로 함께 저장한다.
   answered_at은 DB가 생성한다. 행동 횟수 DB 동기화는 아직 없으며 PostHog의 기존 로컬 횟수를
   유지한다. 단일 페이지 요청은 직렬화한다. 여러 탭/지연 요청의 순서를 보장하는 revision은
   별도 계약과 migration이 필요하다.
3. 완료: 서버에서 버전별 모든 답을 검증하고 기존 calculateScore로 재계산한다.
   003의 complete_attempt RPC가 부모 행을 잠그고 계산에 사용한 답변과 현재 DB 답변이 같은지
   확인한 뒤 완료 필드/점수/태그/횟수를 한 트랜잭션으로 반영한다.
   완료 요청 재전송은 동일 결과를 반환하고 완료 후 늦은 진행 write는 거부한다.
4. retry: 기존 행/답을 유지하고 새 UUID, is_retry=true로 시작한다. 이전 완료 상태를 초기화하지 않는다.
5. 새로고침/결과 복구: 기존 attempt를 재사용한다. resultSnapshot에서 새 시도를 만들지 않는다.
   기존 analytics 전송 마커를 DB 동기화 성공 마커로 재사용하지 않는다. DB 장애와 PostHog 장애는
   별도로 재시도하며 테스트 UI가 동작하도록 동기화 상태를 분리한다.

현재 restoreAttempt는 UUID가 아닌 비어 있지 않은 문자열도 받아들인다. 실제 TestRunner는
서버 UUID를 사용하고 credential의 UUID 형식/ID 일치 검증을 추가한다. 과거 로컬 전용 진행은
새 테스트를 안내하며 PostHog와 다른 UUID로 몰래 치환하지 않는다.
이름, 이메일, IP, 전체 userAgent, 임의 query string, 민감정보는 저장하지 않는다.

## 검증

로컬 명령: `npx tsc --noEmit`, `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`.
프로세스 생성이 제한된 환경에서는 `node --test --test-isolation=none tests/*.test.mjs`로
동일한 전체 테스트를 단일 프로세스에서 실행한다.
databaseSchema.test.mjs는 보안 설정/키/점수 타입 정합성을 정적으로 검증한다.
serverDatabase.test.mjs는 token 생성·해시·검증, 잘못된 입력, 환경변수 오류 정제,
SDK 초기화 옵션, 클라이언트의 전이적 import 경로를 검증한다. 테스트는 가짜 환경변수와
SDK mock을 사용하고 .env.local을 읽거나 실제 Supabase 요청을 보내지 않는다.
SQL 정적 검사는 실제 PostgreSQL 실행 검증을 대신하지 않는다.

Supabase 적용 후 별도 개발 DB에서 확인할 항목:

- 두 테이블의 RLS enabled, pg_policies에 허용 정책 없음, anon/authenticated 권한 없음.
- service_role SELECT/INSERT/UPDATE 가능, DELETE 불가. 브라우저 역할의 직접 쓰기/읽기 실패.
- 동일 attempt+question upsert 후 한 행 유지, created_at 유지, updated_at 갱신.
- FK 없는 답변, 음수 점수/횟수/인덱스, 빈 질문/답 ID, 완료 필드 누락은 거부.
- write_token_hash 누락/NULL/빈 문자열/64자리 소문자 hex가 아닌 값은 거부.
- 관리자 트랜잭션에서 attempt 삭제 시 answers도 삭제되는지 확인 후 rollback.
- 정상 시작→답변→완료 데이터 저장 가능, 1.234초 같은 소수 duration 유지.
