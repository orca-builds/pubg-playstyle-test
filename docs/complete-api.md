# Complete API

`POST /api/attempts/[attemptId]/complete`를 구현했다.

## 적용

001, 002가 적용된 개발 DB에 `supabase/migrations/003_complete_attempt.sql`을 한 번 적용한다.
기존 migration을 재실행하지 않는다. 이번 검증에서는 원격 migration을 실행하지 않았다.
003은 service_role만 실행할 수 있는 `complete_attempt` RPC를 추가하며 테이블을 삭제하지 않는다.

## Request / response

Content-Type은 application/json이고 다음 필드는 모두 필수다. 추가 필드는 거부한다.

- write_token, duration_seconds, main_type
- combat_score, position_score, frontline_score, support_score, pressure_score, design_score, risk_score, safe_score
- main_body_score, flank_score, hotdrop_score, tail_score, full_loot_score, fast_loot_score,
  center_score, edge_score, standard_gear_score, special_gear_score
- top_sub_tag_1, top_sub_tag_2 (없는 태그는 null)
- answer_change_count, back_count

점수와 횟수는 0~2,147,483,647 정수, duration_seconds는 유한한 0~86,400초다.
숫자 형식 검증 후에도 점수/유형/태그는 서버 재계산과 정확히 일치해야 한다.
클라이언트 duration은 입력 검증만 하고 DB 저장값으로 사용하지 않는다.
행동 횟수는 기존 로컬 analytics 값이며 범위를 검증한다. DB 답변 변경 이력이 없으므로
횟수를 서버에서 독립적으로 재계산하는 것은 이번 범위에 포함하지 않는다.

성공은 HTTP 200이다.

```json
{
  "completed": true,
  "already_completed": false,
  "started_at": "<DB 시작 시각>",
  "completed_at": "<DB 완료 시각>",
  "duration_seconds": 60,
  "answer_change_count": 2,
  "back_count": 3,
  "result": { "main_type": "<유형 ID>", "...": "18개 raw score 및 두 태그" }
}
```

result는 `completionResult.ts`의 명시적인 필드 목록만 반환한다. token/hash/서버 key/SQL 오류를
반환·기록하지 않는다. 모든 응답은 Cache-Control: no-store다.

오류: 입력/결과 불일치 400, 없는 attempt 404, token 불일치 403,
답변 부족/잘못된 DB 답변/버전 불일치/동시 답변 변경/완료 가능 시간 초과 409,
DB 또는 설정 문제 500. 비JSON Content-Type은 415다. 오류 원문 대신 고정 error 코드만 반환한다.

## 서버 검증 및 원자성

attempt UUID와 요청 필드를 검사하고 DB hash를 기존 verifyWriteToken으로 검증한다.
현재 test_version과 question_order_key도 확인한다. 해당 attempt의 DB answers만 조회해
현재 문항 수 24개인지 검사한 뒤 기존 calculateScore를 그대로 호출한다. 이 함수가
q01~q24 전체 존재, 중복·알 수 없는 질문·잘못된 선택지를 검증한다. scoring 모듈은
브라우저 API에 의존하지 않는다. 별도의 점수 계산 구현은 추가하지 않았다.

클라이언트의 main_type/18개 score/두 태그 중 하나라도 계산 결과와 다르면
400 RESULT_MISMATCH로 거부한다. DB에 전달하는 결과는 서버 계산 결과만으로 구성한다.

RPC는 answer API와 같은 부모 행을 FOR UPDATE로 잠그고 token hash/버전과 DB 답변을 재확인한다.
읽어 계산한 답변 목록과 현재 목록이 달라지면 409로 거부하여 오래된 결과를 저장하지 않는다.
미완료 행에서만 다음 컬럼을 한 트랜잭션으로 갱신한다.

- is_completed=true, completed_at=DB clock_timestamp()
- duration_seconds=round(completed_at − DB started_at의 초, 3)
- last_question_index=24
- main_type, 메인 raw score 8개, 보조 raw score 10개, top_sub_tag_1/2
- answer_change_count, back_count

updated_at은 기존 트리거가 갱신한다. 최초 완료 duration이 0~86,400초 밖이면 완료를 거부한다.
이미 완료된 정상 시도의 재요청은 동일한 인증/입력/결과 검증 후
200 already_completed=true를 반환한다. UPDATE를 재실행하지 않으므로 최초 시각·점수·횟수를
덮어쓰지 않는다. 완료 이후 answer API는 409로 차단된다.

## 화면과 복구

Q24 로컬 저장 → 백그라운드 큐의 모든 답변 DB 저장 확인 → 기존 로컬 계산 → complete API → DB 성공 → 로컬 완료 저장 → resultSnapshot 준비
→ PostHog test_complete → /result 이동 순서다. 결과 화면 새로고침은 로컬 snapshot만 복구한다.
test_complete는 기존 attempt별 중복 방지 키를 유지하며, DB가 확정한 duration과 행동 횟수를 사용한다.
로컬 startedAt/completedAt은 기존 복구 규칙을 유지하기 위해 클라이언트 시각 그대로 둔다.
DB/Analytics의 duration과 로컬 두 시각의 단순 차이는 다를 수 있다.

완료 요청 중에는 ref 잠금과 버튼 비활성화로 중복 입력을 막는다. 실패 시 이동하지 않고
로컬 답과 메모리의 계산 결과를 보존한다. 결과 보기를 다시 눌러 재시도할 수 있다.
다른 attempt나 다른 답변의 임시 결과는 재사용하지 않는다.
응답 유실 후 DB만 완료됐을 수 있으므로 localStorage의
`pubg-playstyle-test:completion-pending:v1`에 attempt ID만 기록하고 답변 수정을 잠근다.
새로고침 후에도 같은 credential로 완료를 재시도하며 새 start 요청을 만들지 않는다.
성공 후 pending 기록은 정리한다. 자동 무한 재시도는 하지 않는다.

## 직접 QA

1. 개발 DB에 003을 적용한 뒤 새 테스트를 시작한다. Q24까지 저장하고 answers에 해당 ID로 24행이 있는지 확인한다.
2. 마지막 답변 선택만으로 complete POST가 시작되지 않아야 한다. 결과 보기 클릭 후 큐가 비워져야 complete POST가 시작되고, 200 이후에만 결과 화면으로 이동해야 한다.
3. Table Editor에서 is_completed=true, completed_at 존재, last_question_index=24,
   main_type/18개 score/태그/횟수가 저장됐는지 확인한다. duration은 DB 두 시각 차이를 소수 셋째 자리로 반올림한 값이다.
4. Network의 동일 완료 요청을 재전송한다. already_completed=true이며 completed_at/updated_at/점수/횟수가 그대로여야 한다.
   실제 token을 console이나 공유 자료에 복사하지 않는다.
5. 결과 화면을 새로고침한다. complete 요청이나 test_complete 이벤트가 추가되지 않아야 한다.
6. 별도 시도에서 complete 경로를 Request blocking으로 차단한다. 답변·오류 UI가 유지되고 결과 이동은 없어야 한다.
   차단 해제 후 결과 보기를 다시 누르면 성공해야 한다. 실패 중 새로고침해도 같은 ID로 재시도한다.
7. 개발 테스트용 시도의 답변을 23개로 만든 뒤 complete를 호출하면 409여야 한다.
   점수/태그 변조는 400, 잘못된 token은 403, 없는 UUID는 404인지 확인한다.
8. 완료된 시도에 answer 요청을 보내면 409여야 한다. PostHog test_complete는 같은 attempt_id로 한 번만 기록되어야 한다.

자동 테스트는 실제 SDK+가짜 DB 전송 및 실제 화면 handler를 사용하며 SQL은 정적으로 검증한다.
이는 실제 PostgreSQL 실행·동시 요청·배포 환경 권한 검증을 대체하지 않는다.
