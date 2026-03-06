# Dashboard Design System Draft (2026-03-05)

기준:
- IA/내비게이션: `docs/dashboard-ia-navigation-proposal-20260305.md`
- shadcn create preset(기준):
  - base: `radix`
  - style: `nova`
  - baseColor: `zinc`
  - theme: `teal`
  - iconLibrary: `hugeicons`
  - font: `geist`
  - menuAccent: `subtle`
  - menuColor: `default`
  - radius: `small`
  - ref:
    - light: `https://ui.shadcn.com/create?base=radix&style=nova&baseColor=zinc&theme=teal&iconLibrary=hugeicons&font=geist&menuAccent=subtle&menuColor=default&radius=small&item=preview`
    - dark: `https://ui.shadcn.com/create?base=radix&style=nova&baseColor=zinc&theme=teal&iconLibrary=hugeicons&font=geist&menuAccent=subtle&menuColor=default&radius=small&item=preview`

## 1) Brand Direction

키워드:
- Trustworthy
- Operational
- Fast to scan
- Low-noise, high-signal

제품 톤:
- “멋”보다 “결정 가능성” 우선
- 위험/권한/감사 상태가 즉시 읽혀야 함

## 2) Typography

권장 폰트:
- UI: `Geist`
- Data/Code: `Geist Mono`

타입 스케일:
- `display`: 28/36, 700
- `h1`: 24/32, 700
- `h2`: 20/28, 700
- `h3`: 16/24, 600
- `body`: 14/22, 500
- `body-sm`: 13/20, 500
- `caption`: 12/16, 500

원칙:
- 숫자/지표는 tabular-nums 사용
- 대시보드 표는 `body-sm` 기본

## 3) Color System (Light + Dark)

원칙:
- shadcn가 생성한 `globals.css`의 semantic token(`--background`, `--foreground`, `--card`, `--muted`, `--border`, `--primary` 등)을 단일 기준으로 사용
- 커스텀 hex 하드코딩은 신규 추가 금지(기존 잔존 코드는 점진 제거)
- 상태색(success/warning/danger/info)은 shadcn token에 alias로 연결

### 3-1) Theme Baseline

- Neutral Base: `zinc`
- Brand Accent: `teal`
- Menu Accent Mode: `subtle`

### 3-2) Token Alias Draft (Semantic Layer)

- `color.bg.canvas` -> `--background`
- `color.bg.surface` -> `--card`
- `color.bg.subtle` -> `--muted`
- `color.border.default` -> `--border`
- `color.text.primary` -> `--foreground`
- `color.text.secondary` -> `--muted-foreground`
- `color.brand.primary` -> `--primary`
- `color.brand.onPrimary` -> `--primary-foreground`
- `color.focus.ring` -> `--ring`
- `color.status.success` -> `--chart-2` (또는 별도 `--success`)
- `color.status.warning` -> `--chart-4` (또는 별도 `--warning`)
- `color.status.danger` -> `--destructive`
- `color.status.info` -> `--chart-1` (또는 별도 `--info`)

## 4) Spacing / Radius / Elevation

Spacing scale:
- `4, 8, 12, 16, 20, 24, 32, 40`

Radius:
- `card`: small (`--radius`)
- `input/button`: small (`--radius`)
- `pill`: 999

Shadow:
- `sm`: `0 1px 2px rgba(16,24,40,.06)`
- `md`: `0 6px 18px rgba(16,24,40,.08)`

## 5) Motion

원칙:
- 빠르고 짧게, 상태 전달용만 사용

토큰:
- `duration.fast`: `120ms`
- `duration.base`: `180ms`
- `easing.standard`: `cubic-bezier(0.2, 0, 0, 1)`

사용:
- hover/focus, panel expand/collapse, page transition fade

## 6) Component Rules

### Sidebar
- 상단: org switcher(`DropdownMenu`)
- 중앙: role 기반 nav tree
- 하단: profile/user menu
- 메뉴 스타일: `menuAccent=subtle`, `menuColor=default`
- 비활성(권한 없음): lock 아이콘 + 이유 툴팁

### Top Bar
- 좌: breadcrumb + title
- 중: 검색(요청ID/API Key/User/Tool)
- 우: org/team switcher, time range, refresh, user menu

### KPI Card
- 라벨(12), 값(30~34), 보조 delta 배지
- 상태색은 값 자체가 아닌 아이콘/배지에 제한적으로 사용

### Table
- 헤더 고정(sticky)
- 첫 열은 식별자/이름
- 오른쪽 정렬: 숫자/지표/시간
- 에러코드는 code 스타일 태그로 표시

### Button
- shadcn variant 우선:
  - `default`(primary)
  - `secondary`
  - `destructive`
  - `ghost`
  - `outline`

### Badge / Tag
- `role`: owner/admin/member
- `decision`: allowed/policy_blocked/access_denied/failed
- `severity`: info/warning/critical

## 7) RBAC UX Guidelines

메뉴 정책:
- `member`: Admin/Ops 숨김(또는 잠금형)
- `admin`: 조회 가능, owner-only 액션 비활성
- `owner`: 전체 허용

행동 정책:
- 비활성 버튼 아래 사유 한 줄:
  - `Owner role required`
  - `Admin role required`
  - `Insufficient scope`

에러 정책:
- 403은 상단 고정 경고 배너로 통일
- 배너에 “권한/역할 확인” 액션 링크 포함

## 8) Accessibility

- 텍스트 대비 WCAG AA 이상
- 키보드 탭 순서: sidebar -> topbar -> content
- 포커스 링: `2px solid var(--ring)`
- 아이콘만 있는 버튼은 `aria-label` 필수

## 9) CSS Token Draft

```css
/* source of truth: shadcn generated globals.css */
/* keep semantic tokens (--background/--foreground/--card/--primary/...) from generator output */
:root {
  --radius: 0.375rem; /* small */

  /* optional semantic aliases for dashboard status */
  --success: var(--chart-2);
  --warning: var(--chart-4);
  --info: var(--chart-1);
  --danger: var(--destructive);

  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);
  --shadow-md: 0 6px 18px rgba(16, 24, 40, 0.08);
}

.theme-dark {
  --shadow-sm: 0 1px 2px rgba(2, 6, 23, 0.5);
  --shadow-md: 0 10px 24px rgba(2, 6, 23, 0.55);
}
```

## 10) Screen Blueprint (with current wireframe)

참고 파일:
- `docs/assets/dashboard-ia-wireframe-20260305.svg`

적용 우선순위:
1. Shell(사이드바/탑바) 스타일 고정
2. Overview / API Keys / Audit 화면에 토큰 우선 적용
3. RBAC 배지/잠금/403 배너 컴포넌트 공통화

## 11) shadcn Migration Notes

- 현재 목표는 "새 디자인 시스템 정의"가 아니라 "shadcn preset을 source of truth로 통일"하는 것이다.
- 단계:
  1. shell/sidebar/topbar를 shadcn 컴포넌트로 치환
  2. 기존 커스텀 CSS 변수(`--brand-*`, `--bg-*`)를 shadcn semantic 변수로 매핑/축소
  3. 페이지별 컴포넌트를 variant 기반(`Button`, `Badge`, `Input`)으로 정렬
- 주의:
  - 권한/RBAC 로직은 UI 라이브러리 변경과 무관하게 동일하게 유지
  - Global Search는 API 계약 확정 전까지 disabled 유지
