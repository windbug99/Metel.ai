# Dashboard Design System Draft (2026-03-05)

기준:
- IA/내비게이션: `docs/dashboard-ia-navigation-proposal-20260305.md`
- 스타일 방향: **Vercel + Linear 베이스**, **Perplexity 검색 UX**, **Datadog 상태 시그널**

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
- UI: `IBM Plex Sans`
- Data/Code: `IBM Plex Mono`

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

### 3-1) Light Theme Tokens

#### Core Neutrals
- `bg.canvas`: `#F5F7FA`
- `bg.surface`: `#FFFFFF`
- `bg.subtle`: `#EEF2F7`
- `border.default`: `#D3DAE6`
- `text.primary`: `#111827`
- `text.secondary`: `#475467`
- `text.muted`: `#667085`

#### Brand / Accent
- `brand.500`: `#1F6FEB`
- `brand.600`: `#1558C0`
- `brand.100`: `#DCEBFF`

#### Semantic
- `success.500`: `#1F9D63`
- `warning.500`: `#D97706`
- `danger.500`: `#D92D20`
- `info.500`: `#0EA5E9`

#### Ops Signal (Datadog-like)
- `status.ok`: `#1F9D63`
- `status.warn`: `#D97706`
- `status.critical`: `#D92D20`
- `status.unknown`: `#98A2B3`

### 3-2) Dark Theme Tokens

#### Core Neutrals
- `bg.canvas`: `#0B1117`
- `bg.surface`: `#111927`
- `bg.subtle`: `#162131`
- `border.default`: `#2A3444`
- `text.primary`: `#E6EDF3`
- `text.secondary`: `#C3CDD8`
- `text.muted`: `#96A2B2`

#### Brand / Accent
- `brand.500`: `#5EA4FF`
- `brand.600`: `#7CB7FF`
- `brand.100`: `#1A2C44`

#### Semantic
- `success.500`: `#3CCB86`
- `warning.500`: `#F3A73D`
- `danger.500`: `#FF6B5F`
- `info.500`: `#38BDF8`

#### Ops Signal (Datadog-like)
- `status.ok`: `#3CCB86`
- `status.warn`: `#F3A73D`
- `status.critical`: `#FF6B5F`
- `status.unknown`: `#8B9BB0`

## 4) Spacing / Radius / Elevation

Spacing scale:
- `4, 8, 12, 16, 20, 24, 32, 40`

Radius:
- `card`: 12
- `input/button`: 10
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
- 섹션 라벨은 `caption + muted`
- 활성 메뉴는 `brand.100 + brand.600 text`
- 비활성(권한 없음): lock 아이콘 + 이유 툴팁

### Top Bar
- 좌: breadcrumb + title
- 중: 검색(요청ID/API Key/User)
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
- `primary`: brand fill
- `secondary`: white + border
- `danger`: red outline/fill
- `ghost`: 텍스트 버튼

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
- 포커스 링: `2px solid var(--brand-500)`
- 아이콘만 있는 버튼은 `aria-label` 필수

## 9) CSS Token Draft

```css
:root {
  --bg-canvas: #f5f7fa;
  --bg-surface: #ffffff;
  --bg-subtle: #eef2f7;
  --border-default: #d3dae6;
  --text-primary: #111827;
  --text-secondary: #475467;
  --text-muted: #667085;

  --brand-500: #1f6feb;
  --brand-600: #1558c0;
  --brand-100: #dcebff;

  --success-500: #1f9d63;
  --warning-500: #d97706;
  --danger-500: #d92d20;
  --info-500: #0ea5e9;

  --radius-card: 12px;
  --radius-control: 10px;
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06);
  --shadow-md: 0 6px 18px rgba(16, 24, 40, 0.08);
}

.theme-dark {
  --bg-canvas: #0b1117;
  --bg-surface: #111927;
  --bg-subtle: #162131;
  --border-default: #2a3444;
  --text-primary: #e6edf3;
  --text-secondary: #c3cdd8;
  --text-muted: #96a2b2;

  --brand-500: #5ea4ff;
  --brand-600: #7cb7ff;
  --brand-100: #1a2c44;

  --success-500: #3ccb86;
  --warning-500: #f3a73d;
  --danger-500: #ff6b5f;
  --info-500: #38bdf8;

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

## 11) Benchmark Mapping

- **Vercel**: 레이아웃 단순성, 여백 리듬
- **Linear**: 데이터 밀도, 리스트 가독성
- **Perplexity**: 검색 중심 상호작용
- **Datadog**: 상태/심각도 시그널 체계

결론:
- metel은 “운영 제어 콘솔” 성격이므로, 미니멀 UI에 강한 상태 시그널을 결합한 위 조합이 가장 적합하다.
