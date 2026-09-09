This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## PostHog Analytics (2단계)

현재 Next.js 16.3.4 / React 19.2.8 App Router를 사용합니다. `/`, `/test`, `/result`가
`src/app` 아래에 있고, 진행 상태는 `TestRunner`의 React 상태와 localStorage
(`pubg-playstyle-test:attempt`), 결과는 `resultSnapshot` 구독으로 관리합니다.
Analytics는 UI가 전달하는 기존 attemptId/testVersion을 사용하고, 별도 키에 분석 context와
행동 횟수를 저장합니다. 기존 답변·점수·resultSnapshot 저장 형식은 그대로이며 Supabase 연결은 없습니다.

루트의 `.env.example`을 참고하여 `.env.local`에 다음 두 변수를 설정합니다.
저장소의 예제에는 값이 없으며 `.env.local`은 Git에서 제외됩니다.

```dotenv
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

실제 값은 PostHog 프로젝트 설정의 Project API Key와 해당 프로젝트 리전의 수집용
API host를 사용합니다. 개인 API key나 서버 비밀 키를 넣지 마세요.
`NEXT_PUBLIC_` 값은 브라우저 번들에 포함됩니다. Vercel에서도 사용할 배포 환경에
두 변수를 설정한 뒤 다시 배포해야 합니다. 로컬에서는 설정 후 개발 서버를 재시작합니다.
키·실제 host를 코드, 문서, 커밋, 로그에 복사하지 않습니다.

[PostHog Next.js 공식 가이드](https://posthog.com/docs/libraries/next-js)와 설치된
Next.js의 `instrumentation-client` 가이드에 따라 `src/instrumentation-client.ts`에서
`initializeAnalytics()`를 호출합니다. React Provider/effect가 필요 없으므로 Strict Mode와
재렌더링에 따른 중복 초기화를 피합니다. helper는 진행 중인 초기화 Promise도 공유합니다.
SDK는 브라우저에서 설정 검증 후 비동기로 불러오며 hydration이나 화면 전환을 기다리게 하지 않습니다.

`src/lib/analytics.ts`의 `trackEvent("test_start", properties)`를 이벤트 창구로
사용합니다. 공통 방문 context와 test_version을 자동으로 붙입니다. SSR, 환경변수 누락·공백,
잘못된 host URL, SDK 로딩·초기화 실패에서는 안전하게 no-op 처리합니다.
SDK 로딩 중에는 최대 100개 이벤트를 메모리에 보관하고 초기화 후 순서대로 전달합니다.
대기열 초과 또는 SDK 실패 시에는 버리며, 앱의 자체 재전송 루프는 없습니다.
context와 attempt 속성은 호출 시점에 복사하므로 retry 직후에도 이전 attempt 이벤트가 바뀌지 않습니다.
SDK 예외는 앱으로 전파하거나 로그로 출력하지 않습니다.
잘못된 실제 키, 네트워크 차단 등으로 전송이 실패하는 경우는 브라우저 Network에서 확인합니다.

자동 수집은 최초 SDK 초기화와 SPA 경로 변경 시의 `$pageview`만 켭니다.
새로고침은 새로운 페이지뷰이며 테스트 완료 이벤트를 뜻하지 않습니다.
`defaults: "2026-01-30"`으로 기본 동작을 고정하고, `capture_pageview: "history_change"`를
명시했습니다. 클릭/폼 autocapture, pageleave, rage/dead click, heatmap, 성능,
예외 수집, session replay, surveys, flags/원격 설정 요청은 끕니다.
익명 distinct/session ID와 브라우저/기기 등 SDK 기본 이벤트 속성은 포함됩니다.
SDK의 별도 campaign/referrer 저장을 끄고 before_send에서 URL의 query/hash를 제거하며,
referrer는 origin만 남깁니다. 최초 유입 정보는 프로젝트의 공통 context로 관리합니다.
SDK 기본 localStorage+cookie persistence는 PostHog 자체 키를 쓰며 기존 테스트 저장 키와
분리됩니다. `person_profiles: "identified_only"`를 사용하고 identify는 호출하지 않습니다.
세부 설정은 [PostHog 설정 문서](https://posthog.com/docs/libraries/js/config)를 참고하세요.

검증 명령:

```bash
node --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

Windows 실행 환경에서 자식 프로세스 생성이 `EPERM`으로 막히면
`node --test --test-isolation=none tests/*.test.mjs`로 전체 테스트를 실행할 수 있습니다.
이벤트 사양·저장 수명·검증 시나리오는 [Analytics 문서](docs/analytics.md)에 정리했습니다.

직접 확인할 항목:

- 두 변수를 비운 상태에서 `/test` 응답·새로고침 복원·완료 후 `/result`·결과 새로고침이 정상인지 확인합니다.
- 올바른 값을 설정한 뒤 같은 흐름을 반복하고 콘솔에 앱 오류가 없는지 확인합니다.
- Network에서 수집 요청 성공과 PostHog의 Activity/Live events에서 `$pageview` 유입을 확인합니다.
- 초기 진입 및 실제 경로 변경에 페이지뷰가 한 번씩 발생하는지 확인합니다. 질문 선택/재렌더링만으로는 추가되지 않아야 합니다.
- 요청한 커스텀 이벤트 10개가 사양대로 발생하고, 공유 이벤트·`$autocapture`·`$snapshot`·`/flags` 요청은 없는지 확인합니다.
- PostHog 요청을 차단해도 응답 저장·결과 표시가 정상인지 확인합니다. 차단 자체의 Network 오류 표시는 발생할 수 있습니다.
- Vercel 재배포 후에도 같은 항목을 확인합니다. 실제 프로젝트 수신은 로컬 자동 테스트로 검증하지 않습니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
