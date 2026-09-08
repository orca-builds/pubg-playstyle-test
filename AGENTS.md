<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules

## Project

PUBG 플레이 스타일을 분석하는 성향 테스트 웹 서비스.

이 프로젝트의 목표는 단순한 테스트 사이트 제작이 아니라,
사용자 행동 데이터를 수집하고 Growth 실험까지 진행하는 것이다.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Vercel
- PostHog (later)
- Supabase (later)

## Development Rules

- 초보 개발자가 이해할 수 있도록 코드를 단순하고 명확하게 작성한다.
- 기능을 한 번에 많이 구현하지 않는다.
- 한 작업에서는 하나의 주요 기능에 집중한다.
- 컴포넌트, 질문 데이터, 점수 계산 로직을 분리한다.
- 불필요한 라이브러리를 추가하지 않는다.
- 기존 기능을 수정할 때 다른 기능이 깨지지 않도록 한다.
- 수정 후 TypeScript 오류를 확인한다.
- 수정 후 npm run build를 실행해 배포 가능한 상태인지 확인한다.

## Product Rules

- Mobile first로 구현한다.
- 질문은 한 화면에 한 문항씩 표시한다.
- 테스트 결과는 메인 4축으로 결정한다.
- 보조 성향은 내부 점수로 계산하고 가장 강한 태그를 결과에 표시한다.
- 테스트 버전을 데이터에 저장할 수 있도록 설계한다.

## Analytics Rules

추후 다음 이벤트를 추적한다.

- landing_view
- cta_click
- test_start
- question_view
- question_answer
- question_back
- answer_change
- test_complete
- result_view
- share_click
- copy_link
- share_success
- retry_click

Analytics 또는 DB 관련 기능을 구현할 때 중복 이벤트와 새로고침으로 인한 데이터 오염을 고려한다.