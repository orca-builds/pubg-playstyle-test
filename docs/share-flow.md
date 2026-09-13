# 결과 공유

ResultPreview의 클릭 handler → shareResult helper → 기존 trackEvent 순서로 연결한다.
버튼 문구, title, 공유 문구는 src/lib/shareResult.ts에서 관리한다.

공유 문구는 `내 배그 플레이 유형은 {결과유형}!` 다음 줄에
`너는 어떤 유형인지 한번 해봐 👇`를 사용한다. 보조 태그와 raw score는 포함하지 않는다.
URL은 현재 origin의 `/`에 `utm_source=share&utm_medium=user_share&utm_campaign=launch`만
붙인다. 기존 경로/query/hash와 attempt/token/visitor/session 값은 전달하지 않는다.

navigator.share 지원 시 클릭의 사용자 활성화 안에서 title/text/url을 전달한다.
Promise resolve 후 share_success를 기록한다. 이는 API 성공이며 수신자가 읽었다는 뜻은 아니다.
AbortError는 취소로 처리하고 성공 이벤트·오류 안내·자동 복사를 하지 않는다.
다른 오류는 고정 오류 문구를 표시하고 같은 버튼에서 재시도할 수 있다.

navigator.share 미지원 시 clipboard.writeText로 공유 문구 + 줄바꿈 + URL을 복사한다.
성공 후 copy_link와 ‘복사했어요’를 표시한다. clipboard 미지원/권한 거부도 안전한 오류로 처리한다.
share_click은 두 분기 모두 시도 전에 기록하며, 세 이벤트 모두 이전 완료 결과의
attempt_id/main_type/test_version과 예정 share_method를 명시한다. 공유 payload는 analytics에 보내지 않는다.

ref 잠금과 disabled 버튼으로 중복 공유 및 공유/Retry 동시 진행을 막는다.
결과 저장, credential, DB, scoring은 공유 과정에서 변경하지 않는다.

## 수동 QA

1. HTTPS 배포 사이트를 모바일에서 열고 테스트 완료 후 공유하기를 누른다.
   공유 시트의 유형 이름과 랜딩 링크/UTM을 확인한다. 보조 태그와 개인 ID가 없어야 한다.
2. 공유 시트를 취소한다. 오류 표시 없이 다시 공유할 수 있어야 하며 PostHog에는
   share_click만 있어야 한다. 실제 공유 후에는 share_success가 뒤따라야 한다.
3. navigator.share를 지원하지 않는 데스크톱 브라우저에서 공유 버튼을 누르고
   메모장에 붙여 넣어 문구와 URL을 확인한다. ‘복사했어요’ 및 copy_link를 확인한다.
   데스크톱도 Web Share를 지원하면 기본 동작은 공유 시트다.
4. 브라우저에서 클립보드 권한을 차단한 환경에서 복사를 시도한다. 안전한 오류가 표시되고
   copy_link는 없어야 한다. 권한 복구 후 재시도한다.
5. 빠르게 두 번 눌러 공유 시트/복사가 한 번만 실행되는지 확인한다.
6. 공유받은 링크는 결과가 아닌 랜딩을 열어야 한다. 새 방문자의 최초 유입은
   share/user_share/launch이며 기존 방문자의 최초 유입 정보는 기존 정책대로 유지한다.

자동 테스트는 API 모의 객체로 분기·이벤트·보안·중복 클릭을 검증한다.
실제 OS 공유 시트, 클립보드 권한, PostHog 원격 수집은 위 수동 절차로 확인한다.
