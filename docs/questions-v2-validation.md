# 문항 v2 반영 및 검증

## 변경 파일

- `src/data/questions.ts`: 확정된 Q1~Q24 원문과 줄바꿈, 점수 매핑, `testVersion = "v2"`.
- `src/lib/scoring.ts`: 지원 버전 검사와 설명을 v2로 변경. 합산·백분율·결과 판정·보조 태그 계산 알고리즘 유지.
- `src/lib/README.md`: scoring 버전 설명 수정.
- `tests/questionsV2.test.mjs`: 확정안 일치, 문항/ID/점수 검증, 보조축 양극·중립, 버전 복원 및 analytics 회귀 테스트 추가.
- `tests/fixtures/questions-v2.json`: 첨부 확정안에서 추출한 24문항과 매핑.
- `tests/fixtures/scoring-v2.json`: 기존 회귀 fixture의 메인 결과를 유지하고 변경된 보조 점수와 버전을 반영한 v2 기대값. 과거 `scoring-before-choice-ids.json`은 보존.
- `tests/scoring.test.mjs`: v2 fixture와 보조 점수 기대값 적용.
- `tests/databaseSchema.test.mjs`: 보조 점수 최댓값 기대값 수정.
- `tests/answerApi.test.mjs`, `tests/completeApi.test.mjs`: v2 저장/RPC 및 v1 attempt 거부 검증.
- `tests/startDatabaseAttempt.test.mjs`: 신규 attempt 요청의 v2 검증.
- `tests/shareResult.test.mjs`: 공유 context를 v2로 검증.
- `tests/resultShareButton.test.mjs`: 실제 결과 컴포넌트의 result_view·공유 이벤트 v2 및 재렌더 중 조회 중복 방지 검증.
- `docs/questions-v2-validation.md`: 이 완료 보고 및 수동 QA 절차.

## 문항과 점수

Q1~Q24 총 **24문항**, 질문마다 선택지 2개, 고유한 내부 answer ID **48개**를 확인했다.
질문 ID, 내부 choice ID, 문항 순서 및 16개 결과 ID 구조는 유지했다.
상황/선택지 문구는 확정안의 줄바꿈까지 저장했다.

줄바꿈을 제외하고 문구 또는 매핑이 변경된 문항은 **13개**다:
Q3, Q5, Q8, Q9, Q10, Q13, Q14, Q15, Q18, Q19, Q21, Q23, Q24.
나머지 11문항은 기존 문구가 확정안과 동일하다.

| 메인축 | 문항 | 축당 문항 수 / 한쪽 최대 점수 |
| --- | --- | --- |
| combat / position | Q1~Q5 | 5 / 5 |
| frontline / support | Q6~Q10 | 5 / 5 |
| pressure / design | Q11~Q15 | 5 / 5 |
| risk / safe | Q16~Q20 | 5 / 5 |

| 보조축 | 문항 | 축당 문항 수 / 한쪽 최대 점수 |
| --- | --- | --- |
| mainBody / flank | Q11, Q13 | 2 / 2 |
| hotdrop / tail | Q16, Q23 | 2 / 2 |
| fullLoot / fastLoot | Q21, Q24 | 2 / 2 |
| center / edge | Q17, Q19 | 2 / 2 |
| standardGear / specialGear | Q14, Q22 | 2 / 2 |

- Q14: choice-1은 pressure +1, standardGear +1; choice-2는 design +1, specialGear +1.
- Q19: choice-1은 risk +1, center +1; choice-2는 safe +1, edge +1.
- Q15: 기존 choice-2의 specialGear 점수를 제거했다.
- Q18: 이동 경로 상황으로 교체했고 risk/safe +1만 부여한다. 기존 코드도 risk/safe였으므로 수치 매핑은 동일하다.
- 모든 점수 key와 각 선택지의 정확한 +1 매핑, 누락/추가 점수 없음 검증 통과.
- 양쪽 전체 선택, 실제 응답으로 16개 메인 유형 도달, 보조축 2:0·1:1·0:2 및 표시 태그 검증 통과.

## 버전 전달 및 기존 구조

`src/data/questions.ts`의 testVersion을 `questionSet.version`으로 공유한다.
다음 경로가 이 값을 사용하므로 신규 데이터는 v2가 된다.

- `testProgress.ts`: 신규 attempt와 유효한 저장값 복원.
- `startDatabaseAttempt.ts` → `server/startAttemptInput.ts` → `/api/attempts/start`: 요청 검증 후 `test_attempts.test_version = "v2"` 저장.
- answers/complete API: DB attempt 버전 검사 및 RPC의 `p_test_version` 전달.
- `scoring.ts` → `resultSnapshot.ts`: 계산 결과의 testVersion을 v2로 전달.
- `testAnalytics.ts`: attempt 버전을 test_start, question_view, question_answer, answer_change, test_complete, retry_click 등에 전달.
- `ResultPreview.tsx`, `shareResult.ts`: 결과 버전을 result_view와 공유 이벤트에 전달.
- `analytics.ts`: 버전 속성이 생략된 이벤트의 기본값은 questionSet.version.

DB migration, 기존 DB row 변경, API 구조 변경, analytics 이벤트 이름/의미 변경은 없다.
main_type, main/sub scores, top support tags, resultSnapshot 구조도 유지했다.
브라우저 저장 key의 `:v1`은 저장 형식 버전이므로 변경하지 않았다.
기존 복원 정책에 따라 v1 진행/완료 저장값은 버전 불일치로 처리하며 v2 결과로 재계산하지 않는다.
기존 v1 DB attempt에 대한 답변·완료 요청은 버전 불일치로 거부한다.

선택지 표시 로직은 변경하지 않았다. attempt마다 12/12 균형, 새로고침/이전/답변 변경 후 순서 유지,
display_position/display_label, DB/analytics의 내부 answer ID 및 표시 순서와 독립적인 결과 계산 테스트가 통과했다.
UI·결과 이미지·공유·로딩 구현은 변경하지 않았다.

## 실행 검증

- `node --test --experimental-test-isolation=none tests/*.test.mjs`: **206개 통과, 실패 0**.
  기본 실행은 환경의 자식 프로세스 실행 제한(`spawn EPERM`)으로 시작하지 못해 단일 프로세스 모드로 전체 테스트를 실행했다.
- `npx tsc --noEmit`: 통과.
- `npm run lint`: 통과.
- `npm run build`: 통과. Next.js 16.3.4 production build 및 전체 route 생성 완료.
- `git diff --check`: 통과.

기존 start, answer save, background queue, restart queue drain, previous, answer_change,
refresh recovery, Q24 complete, retry, result image, sharing, loading overlay/timing,
PostHog, Supabase 및 display randomization 회귀 테스트를 모두 포함한다.
외부 서비스 검증은 모의 SDK/HTTP 응답 기반이며, 실제 DB 쓰기·PostHog 수집·브라우저 수동 QA는 수행하지 않았다.

## 브라우저 QA 절차

1. `npm run dev`로 실행하고 모바일 너비에서 새 테스트를 시작한다. 개발자 도구 Network의 start 요청에 `test_version: "v2"`가 있는지 확인한다.
2. Q1~Q24 상황과 선택지를 확정안과 대조한다. 특히 긴 Q10/Q14/Q18/Q19 선택지가 잘리거나 버튼 영역 밖으로 나가지 않는지 확인한다.
3. 몇 문항에 답한 뒤 이전으로 돌아가 답을 바꾸고 새로고침한다. 답변/진행 위치와 해당 attempt의 A/B 표시 순서가 유지되는지 확인한다.
4. 개발자 도구 Application의 `pubg-playstyle-test:attempt`에서 testVersion이 v2인지, choiceDisplayOrder가 24쌍이고 choice-1의 첫 위치/둘째 위치가 각각 12개인지 확인한다. Network answers 요청의 answer_id가 클릭한 문구의 내부 ID와 일치하는지도 확인한다.
5. 네트워크를 잠시 끊고 답변한 다음 복구한다. 저장 큐가 처리되고, 재시작 시 기존 큐 처리와 새 attempt 생성 흐름이 정상인지 확인한다.
6. Q24를 완료한다. 로딩 표시 후 결과 이미지·메인축·보조 태그가 나타나는지 확인하고 새로고침 후 결과가 유지되는지 확인한다.
7. 공유하기의 모바일 공유창, 취소 후 버튼 복구, 지원하지 않는 브라우저의 링크 복사를 확인한다. 다시하기로 새 attempt가 생성되는지 확인한다.
8. 실제 Supabase에서 새 attempt의 test_version이 v2이며 answers의 내부 ID가 유지되는지 확인한다. 기존 v1 row가 보존되어야 한다.
9. PostHog에서 test_start, question_view, question_answer, answer_change, test_complete, result_view, retry_click, share_click 및 성공 방식에 따른 share_success/copy_link의 test_version이 v2인지 확인한다. 새로고침/중복 클릭으로 start·complete가 중복되지 않는지도 확인한다.
10. 별도 브라우저 프로필의 기존 v1 저장값에서는 기존 버전 불일치 안내/새 시작 흐름이 표시되고 v1 응답을 v2 결과로 재계산하지 않는지 확인한다.
