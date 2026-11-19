# 접속 통계 보기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방문이 일어날 때마다 익명 ID와 시각을 무료 Postgres에 쌓고, 운영자만 비밀번호로 들어가는 `/stats`에서 일·주·월별 방문자 수를 막대 그래프와 표로 본다.

**Architecture:** 브라우저가 화면 서버의 `POST /api/v1/visits`로 방문을 보내면, 화면 서버가 기존 방식대로 `X-Internal-Key`를 붙여 Go 서버로 넘기고 Go 서버가 Neon Postgres에 한 줄을 넣는다. `/stats`는 서버에서 그리는 페이지로, Next.js의 `proxy.ts`가 HTTP Basic 인증으로 막고 페이지가 Go 서버의 `GET /api/v1/stats`를 서버끼리 직접 부른다(브라우저용 조회 경로를 따로 열지 않는다).

**Tech Stack:** Go 1.26 + `github.com/jackc/pgx/v5`(이 서버의 첫 외부 라이브러리), Next.js 16.3.3, React 19.2.8, Tailwind 4, vitest(node 환경), Neon Postgres(Vercel 연동), Vercel CLI 66.

**Spec:** `docs/superpowers/specs/2026-11-19-visit-stats-design.md`

**전체 완료조건:** `just check` 통과, 그리고 Task 7의 실서비스 확인 여섯 항목이 모두 실제 출력으로 확인됨.

## Global Constraints

- 비용을 내지 않는다. Neon 설치에서 0원짜리 플랜이 보이지 않거나 결제 수단을 요구하면 **멈추고 운영자에게 묻는다.**
- 데이터베이스에 넣는 값은 익명 ID와 시각뿐이다. IP·브라우저 정보·위치·검색어·카카오에서 받은 어떤 값도 넣지 않는다.
- 통계 수집이 서비스 화면을 느리게 하거나 오류 안내를 띄우면 안 된다. 방문 전송의 실패는 화면에 드러내지 않는다.
- 데이터베이스 연결 주소가 없어도 Go 서버는 뜨고, 기존 조회(`/api/v1/nearby`, `/api/v1/places`)는 그대로 된다.
- `/stats` 비밀번호가 비어 있으면 아무도 들어가지 못한다(비어 있다고 열어 두지 않는다).
- Go 서버의 새 경로 둘은 `X-Internal-Key`를 요구한다(기존 `authorized` 그대로).
- 날짜는 한국 시간(`Asia/Seoul`), 한 주는 월요일 시작.
- 새 npm 패키지를 설치하지 않는다. 그래프는 SVG로 직접 그린다.
- 브라우저 저장 키는 `random-choice.<이름>.v1` 형식.
- 새 Go 오류 코드는 `api/internal/httpapi/handler.go`에 적지 않는다. 그 파일의 코드는 `web/lib/errors.test.ts`가 전부 화면 안내 문구와 대조하는데, 통계 경로의 오류는 방문자 화면에 나오지 않는다. 새 처리기는 `api/internal/httpapi/stats.go`에 둔다.
- 환경변수는 미리보기(Preview)에 넣지 않는다. 미리보기 배포마다 데이터베이스 복사본을 만드는 기능은 켜지 않는다.
- 커밋 메시지는 이 저장소의 관례(`feat(api): …한다`, `feat(web): …한다`, `docs: …적는다`)를 따른다. 작업 브랜치는 이미 만들어진 `worktree-visit-stats`다.
- 화면 코드(`.tsx`)를 쓰기 전에 `vercel:react-best-practices`와 `vercel:nextjs` 스킬을 읽는다. Next.js 동작은 `web/node_modules/next/dist/docs/`의 문서로 확인한다.

**설계 문서와 달라지는 점 하나:** 설계 문서는 환경변수를 실서비스에만 둔다고 적었지만, 데이터베이스 연결 주소는 **개발(Development) 환경에도** 연결한다. 실서비스용 값은 Vercel이 읽지 못하게 잠그므로, 개발 환경에 없으면 집계 SQL 시험(Task 2)과 "표의 숫자를 데이터베이스에서 직접 센 값과 대조"(Task 7)를 할 길이 없다. `just dev`는 `api/.env`만 읽고 `api/.env.local`은 읽지 않으므로, 로컬에서 서비스를 켜도 통계가 쌓이지는 않는다.

## Review Focus

1. **데이터베이스가 잠들었거나, 닿지 않거나, 연결 주소가 없음** → 방문 전송은 조용히 실패하고 기존 조회는 그대로 되며, `/stats`는 죽지 않고 "불러오지 못했어요"를 보여야 한다. (Task 3의 `TestVisitsWithoutStore…`·`TestVisitsStoreFailure…`, Task 5의 `fetchStats` 실패 시험)
2. **엉뚱한 방문 본문**(JSON 아님, 아주 큼, ID 형식 틀림, SQL 조각) → 400이고 아무것도 저장되지 않아야 한다. (Task 3의 `TestVisitsRejectsBadBodies`)
3. **브라우저 저장소가 예외를 던짐**(일부 사생활 보호 모드) → 화면에 예외가 올라오지 않고 방문도 보내지 않아야 한다. (Task 4의 `claimVisit` 시험)
4. **이상한 인증 헤더**(Basic 아님, base64 아님, 콜론 없음, 비밀번호 환경변수 비어 있음) → 언제나 401. (Task 5의 `checkBasicAuth` 시험)
5. **한국 시간의 날·주·월 경계**(00:30의 방문은 세계시로는 전날, 일요일 23:59와 월요일 00:00, 12월 31일과 1월 1일) → 한국 시간 기준 칸에 들어가야 한다. (Task 2의 `TestBucketsUsesKoreanBoundaries`)

---

### Task 1: Neon을 Vercel로 붙인다

코드보다 먼저 한다. 0원으로 되지 않으면 이 계획 전체가 성립하지 않기 때문이다.

**완료조건:** `vercel integration list`에 Neon 자원이 `api` 프로젝트에 연결된 것으로 나오고, `api/.env.local`에 `DATABASE_URL=`로 시작하는 줄이 있다. 고른 플랜의 가격이 0이다.

**쓸 스킬:** `vercel:marketplace`, `vercel:vercel-storage`, `vercel:vercel-cli`를 먼저 읽는다.

- [ ] **Step 1:** `cd api && vercel link --yes --project api`. (연결 정보 `.vercel/`은 커밋되지 않아 이 작업 폴더에는 없다.)
- [ ] **Step 2:** `vercel integration add neon --help`와 `vercel integration discover postgres`로 고를 수 있는 플랜과 가격을 확인한다. **0원 플랜이 없으면 멈춘다.**
- [ ] **Step 3:** 설치한다. `vercel integration add neon --name random-choice-stats -e production -e development --billing-plan <0원 플랜 ID>`. 약관 동의가 필요하면 `vercel integration accept-terms neon`을 쓰되, 브라우저 로그인이나 결제 수단을 요구하면 멈추고 운영자에게 그 단계만 넘긴다.
- [ ] **Step 4:** 확인한다. `vercel integration list` → 자원이 보인다. `vercel env ls` → `DATABASE_URL`이 Production과 Development에만 있고 Preview에는 없다. Preview에 있으면 `vercel integration resource` 명령으로 연결을 고친다.
- [ ] **Step 5:** `api/.env.local`이 없으면 `vercel env pull .env.local --environment=development`. `grep -c '^DATABASE_URL=' .env.local` → `1`. `git status --short`에 이 파일이 나오지 않는다(무시 규칙 `.env*`).
- [ ] 커밋할 것 없음.

---

### Task 2: 방문을 넣고 세는 저장소 (Go)

**완료조건:** `cd api && go test ./...` 통과. 연결 주소를 준 상태에서 `go test ./internal/stats -run TestBuckets -v`가 건너뛰지 않고 통과.

**쓸 스킬:** `superpowers:test-driven-development`

**Files:**
- Create: `api/internal/stats/stats.go`, `api/internal/stats/postgres.go`, `api/internal/stats/postgres_test.go`
- Modify: `api/go.mod`, `api/go.sum`

**Interfaces — Produces:**

```go
package stats

type Unit string
const ( Day Unit = "day"; Week Unit = "week"; Month Unit = "month" )

// ParseUnit은 "day"·"week"·"month"만 받는다. 그 밖은 ok=false.
func ParseUnit(s string) (Unit, bool)

// Span은 단위별로 보여 줄 칸 수다: Day 30, Week 12, Month 12.
func (u Unit) Span() int

type Bucket struct {
    Start    string `json:"start"`    // 칸이 시작하는 한국 날짜 "2006-01-02"
    Visitors int    `json:"visitors"` // 서로 다른 익명 ID 수
    Visits   int    `json:"visits"`   // 줄 수
}

// IsVisitorID는 소문자 UUID 꼴(8-4-4-4-12, 16진수)인지 본다.
func IsVisitorID(s string) bool

type PostgresStore struct{ /* … */ }
func NewPostgresStore(databaseURL string) (*PostgresStore, error) // 연결은 첫 사용 때 맺는다
func (s *PostgresStore) RecordVisit(ctx context.Context, visitorID string) error
func (s *PostgresStore) Buckets(ctx context.Context, unit Unit, now time.Time) ([]Bucket, error) // 오래된 칸부터
```

정한 것:

- `pgxpool`을 쓰고 `MaxConns`는 2. `NewPostgresStore`는 주소 문법만 검사하고 연결하지 않는다(데이터베이스가 잠들어 있어도 서버가 뜬다).
- 테이블은 첫 사용 때 한 번 만든다(성공할 때까지 다음 호출에서 다시 시도). 따로 실행할 SQL 파일이나 명령을 두지 않는다.

```sql
CREATE TABLE IF NOT EXISTS visits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id uuid        NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_visited_at_idx ON visits (visited_at);
```

- `RecordVisit`은 `INSERT INTO visits (visitor_id) VALUES ($1)`. 시각은 데이터베이스가 찍는다.
- `Buckets`의 SQL($1 단위, $2 칸 수, $3 지금). 방문이 없는 칸도 0으로 나온다.

```sql
WITH bounds AS (
  SELECT date_trunc($1::text, $3::timestamptz AT TIME ZONE 'Asia/Seoul') AS last
), series AS (
  SELECT generate_series(last - ($2::int - 1) * ('1 ' || $1::text)::interval,
                         last, ('1 ' || $1::text)::interval) AS start
  FROM bounds
)
SELECT to_char(s.start, 'YYYY-MM-DD'), count(DISTINCT v.visitor_id), count(v.visitor_id)
FROM series s
LEFT JOIN visits v
  ON v.visited_at >= (s.start AT TIME ZONE 'Asia/Seoul')
 AND v.visited_at <  ((s.start + ('1 ' || $1::text)::interval) AT TIME ZONE 'Asia/Seoul')
GROUP BY s.start ORDER BY s.start;
```

- 시험이 실제 기록을 건드리지 않게, 저장소 안쪽은 `Exec`·`Query`만 가진 작은 인터페이스에 기대게 한다(`*pgxpool.Pool`과 `pgx.Tx`가 둘 다 만족). 시험은 트랜잭션을 열어 그 위에서 돌리고 끝에 되돌린다.

- [ ] **Step 1: 실패하는 시험을 쓴다** (`postgres_test.go`)

`TestParseUnit`, `TestIsVisitorID`(대문자·길이 틀림·`'; DROP TABLE visits;--`는 false)는 데이터베이스 없이 돈다.

`TestBucketsUsesKoreanBoundaries`는 환경변수 `STATS_TEST_DATABASE_URL`이 없으면 `t.Skip`. 트랜잭션 안에서 아래 줄을 `visited_at`을 직접 적어 넣고, 지금을 `2001-01-17T03:00:00Z`(한국 시간 수요일 12:00)로 주어 부른 뒤 되돌린다. 2001년을 쓰는 까닭은 실제 기록과 겹치지 않게 하기 위해서다.

| 익명 ID | visited_at (세계시) | 한국 시간 |
|---|---|---|
| A | 2001-01-16T15:30:00Z | 1/17(수) 00:30 |
| A | 2001-01-17T02:00:00Z | 1/17(수) 11:00 |
| B | 2001-01-16T14:59:00Z | 1/16(화) 23:59 |
| B | 2001-01-14T14:59:00Z | 1/14(일) 23:59 |
| C | 2001-01-14T15:00:00Z | 1/15(월) 00:00 |
| C | 2000-12-31T14:59:00Z | 12/31 23:59 |

기대값(마지막 칸들만 대조):

- Day, 마지막 3칸: `{2001-01-15, 1, 1}`, `{2001-01-16, 1, 1}`, `{2001-01-17, 1, 2}`. 전체 길이 30.
- Week, 마지막 2칸: `{2001-01-08, 1, 1}`, `{2001-01-15, 3, 4}`. 전체 길이 12.
- Month, 마지막 2칸: `{2000-12-01, 1, 1}`, `{2001-01-01, 3, 5}`. 전체 길이 12.

`TestRecordVisitStoresOneRow`(같은 조건으로 건너뜀): 트랜잭션 안에서 `RecordVisit` 뒤 그 ID의 줄 수가 1.

- [ ] **Step 2:** `cd api && go test ./internal/stats` → 컴파일 실패.
- [ ] **Step 3:** `go get github.com/jackc/pgx/v5@latest` 후 위 인터페이스대로 구현한다. `postgres.go` 머리 주석에 이 서버의 첫 외부 라이브러리로 pgx를 고른 까닭(표준 라이브러리에 Postgres 드라이버가 없고, pgx가 연결 풀을 함께 준다)을 적는다.
- [ ] **Step 4:** `go test ./internal/stats -v` → 데이터베이스 없는 시험 통과, 나머지 SKIP.
- [ ] **Step 5:** `STATS_TEST_DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" go test ./internal/stats -v` → `TestBuckets…`와 `TestRecordVisit…`가 PASS(SKIP 아님). 그 뒤 `go test ./... && go vet ./...` 통과.
- [ ] **Step 6: 커밋** `feat(api): 방문을 넣고 일·주·월로 세는 저장소를 더한다`

---

### Task 3: 방문 받기와 통계 주기 (Go HTTP)

**완료조건:** `cd api && go test ./... && go vet ./...` 통과.

**쓸 스킬:** `superpowers:test-driven-development`

**Files:**
- Create: `api/internal/httpapi/stats.go`, `api/internal/httpapi/stats_test.go`
- Modify: `api/internal/httpapi/handler.go`(`NewHandler`), `api/cmd/server/main.go`

**Interfaces:**
- Consumes: Task 2의 `stats.Unit`, `stats.ParseUnit`, `stats.Bucket`, `stats.IsVisitorID`, `stats.NewPostgresStore`
- Produces:

```go
// httpapi
type VisitStore interface {
    RecordVisit(ctx context.Context, visitorID string) error
    Buckets(ctx context.Context, unit stats.Unit, now time.Time) ([]stats.Bucket, error)
}
type Option func(*options)
func WithVisitStore(store VisitStore) Option
func NewHandler(finder PlaceFinder, spots SpotFinder, internalKey string, opts ...Option) http.Handler
```

`NewHandler`의 기존 인자 셋은 그대로 둔다(시험이 38곳에서 부른다).

| 경로 | 요청 | 응답 |
|---|---|---|
| `POST /api/v1/visits` | 본문 `{"visitorId":"<uuid>"}`, 256바이트까지 | 200 `{"ok":true}` |
| `GET /api/v1/stats?unit=day\|week\|month` | `unit`이 없으면 `day` | 200 `{"unit":"day","buckets":[{"start":"2026-11-19","visitors":5,"visits":8}]}` 오래된 칸부터 |

| 상황 | 상태 | 코드 |
|---|---|---|
| 비밀값 헤더 틀림 | 401 | `unauthorized` |
| 저장소가 없음(연결 주소 미설정) | 503 | `not_configured` |
| 본문이 JSON이 아님·너무 큼·ID 형식 틀림 | 400 | `invalid_visitor` |
| `unit` 값이 셋 밖 | 400 | `invalid_unit` |
| 저장소가 오류를 돌려줌 | 500 | `storage_error` (원인은 `slog.Error`로만) |

저장소 호출에는 5초 제한을 건다. 응답은 기존 `writeJSON`·`writeError`를 쓴다(`Cache-Control: no-store`가 붙는다).

- [ ] **Step 1: 실패하는 시험을 쓴다** (`stats_test.go`, 가짜 `VisitStore` 사용)
  - `TestVisitsStoresVisitorID`: 올바른 본문 → 200, 가짜 저장소가 그 ID를 한 번 받음.
  - `TestVisitsRejectsBadBodies`(표 시험): `not json`, `{}`, `{"visitorId":"abc"}`, 대문자 UUID, `{"visitorId":"'; DROP TABLE visits;--"}`, 300바이트 본문 → 모두 400 `invalid_visitor`, 저장소 호출 0번.
  - `TestVisitsRequiresInternalKey`, `TestStatsRequiresInternalKey`: 열쇠가 설정됐는데 헤더가 없으면 401, 저장소 호출 0번.
  - `TestVisitsWithoutStoreIsNotConfigured`, `TestStatsWithoutStoreIsNotConfigured`: `WithVisitStore` 없이 만든 처리기 → 503.
  - `TestVisitsStoreFailureIs500`: 저장소가 오류 → 500 `storage_error`, 본문에 원인 문자열이 없음.
  - `TestStatsReturnsBuckets`: `unit=week` → 가짜가 `stats.Week`를 받고, 응답 JSON이 위 모양.
  - `TestStatsDefaultsToDay`, `TestStatsRejectsUnknownUnit`(`unit=year` → 400 `invalid_unit`).
  - `TestNearbyStillWorksWithoutStore`: 저장소 없이도 기존 `/api/v1/nearby`가 200.
- [ ] **Step 2:** `go test ./internal/httpapi -run 'Visits|Stats'` → 실패.
- [ ] **Step 3:** 구현한다. `main.go`는 `DATABASE_URL`이 있으면 `stats.NewPostgresStore`를 만들어 `httpapi.WithVisitStore`로 넘기고, 없거나 문법이 틀리면 `slog.Warn`을 남기고 저장소 없이 뜬다(카카오 열쇠가 없을 때와 같은 방식). `main.go` 머리 주석의 환경변수 설명에 `DATABASE_URL`을 더한다.
- [ ] **Step 4:** `go test ./... && go vet ./...` → 통과. `cd ../web && npm test` → 통과(`errors.test.ts`가 `handler.go`의 오류 코드 수를 세므로, 새 코드가 `handler.go`로 새지 않았는지 여기서 드러난다).
- [ ] **Step 5: 커밋** `feat(api): 방문을 받는 경로와 통계를 주는 경로를 더한다`

---

### Task 4: 브라우저가 방문을 보낸다

**완료조건:** `cd web && npm test && npx tsc --noEmit && npm run lint` 통과. `just dev`로 켠 화면에서 개발자 도구의 네트워크 탭에 `POST /api/v1/visits`가 처음 열 때 한 번만 보이고(로컬은 데이터베이스가 없어 503이 정상), 화면에는 아무 오류 안내도 뜨지 않는다.

**쓸 스킬:** `superpowers:test-driven-development`, `vercel:react-best-practices`

**Files:**
- Create: `web/lib/visitor.ts`, `web/lib/visitor.test.ts`, `web/components/VisitBeacon.tsx`, `web/app/api/v1/visits/route.ts`
- Modify: `web/lib/proxy.ts`, `web/lib/proxy.test.ts`, `web/app/page.tsx`(`<VisitBeacon />`을 한 번 그린다)

**Interfaces — Produces:**

```ts
// web/lib/visitor.ts
import type { Store } from "./visits";
export const VISITOR_ID_KEY = "random-choice.visitor-id.v1";   // localStorage
export const STATS_OWNER_KEY = "random-choice.stats-owner.v1"; // localStorage, 값 "1"
export const VISIT_SENT_KEY = "random-choice.visit-sent.v1";   // sessionStorage, 마지막으로 보낸 시각(ms)
export const VISIT_GAP_MS = 30 * 60 * 1000;

/** 지금 방문을 보내야 하면 익명 ID를, 아니면 null을 돌려준다. 보내야 하면 보낸 시각도 여기서 적는다. */
export function claimVisit(local: Store | null, session: Store | null, now: number, newId: () => string): string | null;
/** /stats에 들어온 브라우저에 표시를 남긴다. 실패해도 던지지 않는다. */
export function markStatsOwner(local: Store | null): void;
/** 방문을 보낸다. 어떤 실패도 던지지 않는다. */
export function sendVisit(visitorId: string, fetcher: typeof fetch): Promise<void>;
/** sessionStorage를 안전하게 얻는다(visits.ts의 browserStore와 같은 방식). */
export function sessionStore(): Store | null;

// web/lib/proxy.ts — 마지막 인자를 더한다. 주지 않으면 지금처럼 GET.
export async function proxyToApi(path, search, apiOrigin, internalKey, fetcher, send?: { method: "POST"; body: string }): Promise<Response>;
```

`claimVisit`의 규칙(위에서부터 먼저 맞는 것):

1. `local`이나 `session`이 null → null.
2. `local`에 `STATS_OWNER_KEY`가 있음 → null.
3. `session`의 `VISIT_SENT_KEY`가 숫자이고 `now - 그 값 < VISIT_GAP_MS` → null. (값이 미래이거나 숫자가 아니면 없는 것으로 본다.)
4. `local`의 ID가 UUID 꼴이면 그것을, 아니면 `newId()`로 만들어 저장한 것을 쓴다. `session`에 `now`를 적고 ID를 돌려준다.
5. 읽기·쓰기 어디서든 예외가 나면 null.

`sendVisit`은 `fetcher("/api/v1/visits", { method: "POST", body: JSON.stringify({ visitorId }), headers: { "Content-Type": "application/json" }, keepalive: true })`이고 응답을 읽지 않는다.

`VisitBeacon`은 아무것도 그리지 않는 클라이언트 컴포넌트다. 마운트될 때 한 번, 그리고 `visibilitychange`에서 `document.visibilityState === "visible"`일 때마다 `claimVisit(browserStore(), sessionStore(), Date.now(), () => crypto.randomUUID())`를 부르고, ID가 나오면 `sendVisit`을 기다리지 않고 부른다. 떠날 때 리스너를 뗀다.

`route.ts`의 `POST`는 기존 `nearby/route.ts`와 같은 껍데기다: `request.text()`로 본문을 읽어 `proxyToApi("/api/v1/visits", "", apiOrigin, internalKey, fetch, { method: "POST", body })`에 넘긴다.

- [ ] **Step 1: 실패하는 시험을 쓴다** (`visitor.test.ts`, `Map`으로 만든 가짜 `Store`)
  - 처음: ID를 만들어 `local`에 저장하고 돌려주며, `session`에 `now`가 적힌다.
  - 같은 탭에서 29분 뒤: null. 30분 뒤: 같은 ID.
  - `session`만 새것(새 탭): 같은 ID를 다시 돌려준다(`newId`는 부르지 않는다).
  - `STATS_OWNER_KEY`가 있으면 null이고 `session`에 아무것도 적지 않는다.
  - `local`이 null, `session`이 null → null.
  - `local.getItem`이 던짐, `session.setItem`이 던짐 → null이고 예외가 밖으로 나오지 않는다.
  - `local`의 ID가 `"abc"`처럼 망가져 있으면 새로 만든다. `session`의 값이 `"NaN"`이거나 미래 시각이면 보낸 적 없는 것으로 본다.
  - `sendVisit`: `fetcher`가 던져도, 500을 돌려줘도 던지지 않는다. 호출 인자가 위에 적은 그대로다.
  - `markStatsOwner(null)`과 `setItem`이 던지는 저장소 → 던지지 않는다.

  `proxy.test.ts`에 더한다: `send`를 주면 `fetcher`가 `method: "POST"`, 같은 `body`, `Content-Type: application/json`, `X-Internal-Key`를 받는다. `send`가 없는 기존 시험은 그대로 통과한다.
- [ ] **Step 2:** `cd web && npm test` → 새 시험 실패.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `npm test && npx tsc --noEmit && npm run lint` → 통과.
- [ ] **Step 5:** `just dev`를 켜고 완료조건의 브라우저 확인을 한다(새로 고침으로는 다시 보내지 않는 것까지). 확인한 내용을 한 줄로 남긴다.
- [ ] **Step 6: 커밋** `feat(web): 방문을 익명 ID와 함께 서버로 보낸다`

---

### Task 5: `/stats` 화면

**완료조건:** `cd web && npm run build && npm test && npx tsc --noEmit && npm run lint` 통과. `STATS_PASSWORD=test1234 just dev`에서 `curl -s -o /dev/null -w '%{http_code}' localhost:3000/stats` → `401`, `curl -u any:wrong …` → `401`, `curl -u any:test1234 …` → `200`. `STATS_PASSWORD` 없이 켜면 올바른 비밀번호를 줘도 `401`.

**쓸 스킬:** `superpowers:test-driven-development`, `vercel:react-best-practices`, `vercel:nextjs`. 쓰기 전에 `web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`와 `page.md`(`searchParams`)를 읽는다.

**Files:**
- Create: `web/lib/statsAuth.ts`, `web/lib/statsAuth.test.ts`, `web/lib/stats.ts`, `web/lib/stats.test.ts`, `web/proxy.ts`, `web/app/stats/page.tsx`, `web/components/StatsChart.tsx`, `web/components/StatsOwnerMark.tsx`

**Interfaces:**
- Consumes: Task 3의 응답 모양, Task 4의 `markStatsOwner`, `browserStore`(`web/lib/visits.ts`), `INTERNAL_KEY_HEADER`와 `Fetcher`(`web/lib/proxy.ts`)
- Produces:

```ts
// web/lib/statsAuth.ts — node:crypto를 쓴다(Proxy는 Node.js 런타임에서 돈다)
/** Authorization 헤더가 "Basic <base64(아무 이름:비밀번호)>"이고 비밀번호가 맞으면 true. password가 ""이면 언제나 false. */
export function checkBasicAuth(header: string | null, password: string): boolean;
export const STATS_CHALLENGE = 'Basic realm="stats", charset="UTF-8"';

// web/lib/stats.ts
export type Unit = "day" | "week" | "month";
export type Bucket = { start: string; visitors: number; visits: number };
export type StatsResult = { ok: true; buckets: Bucket[] } | { ok: false; status: number };
export function parseUnit(value: unknown): Unit;                 // 셋이 아니면 "day"
export function bucketLabel(start: string, unit: Unit): string;  // 아래 표
export function axisMax(values: number[]): number;               // 아래 규칙
export async function fetchStats(unit: Unit, apiOrigin: string, internalKey: string, fetcher: Fetcher): Promise<StatsResult>;
```

정한 것:

- 비밀번호 비교는 양쪽을 SHA-256으로 줄인 뒤 `timingSafeEqual`로 한다(Go 서버의 `authorized`와 같은 까닭: 길이가 응답 시간에 드러나지 않게). 사용자 이름은 보지 않는다.
- `web/proxy.ts`: `export const config = { matcher: ["/stats"] }`. `checkBasicAuth(request.headers.get("authorization"), process.env.STATS_PASSWORD ?? "")`가 false면 401과 `WWW-Authenticate: STATS_CHALLENGE`, 본문 없음. true면 `NextResponse.next()`.
- `page.tsx`는 서버 컴포넌트다. Proxy만 믿지 않고 페이지에서도 `headers()`의 인증 값을 같은 함수로 다시 확인하고, 틀리면 `notFound()`. `searchParams`의 `unit`을 `parseUnit`으로 읽어 `fetchStats`를 부른다(`cache: "no-store"`). `metadata`에 `robots: { index: false, follow: false }`.
- 단위 바꾸기는 상태가 아니라 링크다: `/stats?unit=day`, `?unit=week`, `?unit=month`. 지금 단위에는 `aria-current="page"`.
- `bucketLabel`: day → `11/19 (목)`, week → `11/16 주`(그 주의 월요일), month → `2026-11`. 요일은 `start` 문자열을 세계시 자정으로 읽어 계산한다(서버 시간대에 흔들리지 않게).
- `axisMax`: 가장 큰 값 이상인 가장 작은 수를 1, 2, 5, 10, 20, 50, 100, … 에서 고른다. 모두 0이거나 비었으면 1.
- `StatsChart`: `buckets`(오래된 칸부터)와 `unit`을 받아 SVG 막대(방문자만)를 그린다. 막대마다 `<title>`로 날짜와 값을 넣고, SVG에 `role="img"`와 요약 `aria-label`을 둔다. 색은 `globals.css`의 기존 색 변수를 쓴다. 그림자·그라데이션 없음.
- 표는 최신 칸부터: 날짜 · 방문자 · 방문 횟수. 숫자 칸은 `tabular-nums`.
- `fetchStats`가 실패하면 그래프와 표 자리에 `통계를 불러오지 못했어요. (상태 503)`처럼 상태 번호를 붙여 보여 준다.
- `StatsOwnerMark`는 아무것도 그리지 않는 클라이언트 컴포넌트로, 마운트될 때 `markStatsOwner(browserStore())`를 부른다. 페이지가 인증을 통과했을 때만 그린다.

- [ ] **Step 1: 실패하는 시험을 쓴다**
  - `statsAuth.test.ts`: 맞는 비밀번호(`Basic ` + base64(`me:test1234`)) → true. 이름이 달라도 true. 틀린 비밀번호, 헤더 null, `Bearer x`, `Basic !!!`, 콜론 없는 값, `password === ""`(헤더가 `any:`여도) → false. 비밀번호에 콜론이 든 경우(`a:b:c`, 비밀번호 `b:c`) → true. 한글 비밀번호 → true.
  - `stats.test.ts`: `parseUnit`(`"week"`, `"year"`, `undefined`, `["day","week"]`), `bucketLabel`(`2026-11-19` day → `11/19 (목)`, `2026-11-16` week → `11/16 주`, `2026-11-01` month → `2026-11`), `axisMax`(`[]`→1, `[0,0]`→1, `[3]`→5, `[10]`→10, `[11]`→20, `[137]`→200), `fetchStats`(성공 → 칸 그대로와 호출 주소·헤더, 503 → `{ok:false,status:503}`, `fetcher`가 던짐 → `{ok:false,status:0}`, `buckets`가 배열이 아니거나 칸의 숫자가 숫자가 아님 → `{ok:false,status:200}`).
- [ ] **Step 2:** `npm test` → 실패.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 완료조건의 명령을 모두 돌린다. `npm run build` 출력에서 `/stats`가 요청마다 그려지는 경로(동적)로 잡혔는지 본다.
- [ ] **Step 5:** 브라우저(390×844와 넓은 화면)에서 가짜 Go 응답이나 `api/.env.local`의 주소로 켠 서버를 붙여 그래프·표·단추를 눈으로 확인한다. 밝은 화면과 어두운 화면 둘 다 본다.
- [ ] **Step 6: 커밋** `feat(web): 비밀번호로 들어가는 접속 통계 화면을 더한다`

---

### Task 6: 문구와 문서를 사실에 맞춘다

**완료조건:** `grep -rn "저장소가 없\|만 남아요\|직접 정한 것뿐" --include='*.md' --include='*.tsx' . | grep -v node_modules | grep -v docs/superpowers` 의 결과가 비었거나, 남은 줄이 모두 "카카오 조회 결과를 저장하지 않는다"는 뜻으로 읽힌다. `just check` 통과.

**Files:**
- Modify: `web/components/StartScreen.tsx`(안내 문장과 그 위 주석), `PRODUCT.md`, `README.md`. 위 grep에 `DESIGN.md`나 다른 파일이 걸리면 그것도.

- [ ] **Step 1:** `StartScreen.tsx`의 문장을 `위치는 주변 음식점을 찾을 때만 쓰고 저장하지 않아요. 이 기기에는 마지막 검색어와 정한 가게({RETENTION_DAYS}일)가 남아요.`로 바꾼다. 위 주석의 "서버에는 저장소가 없고"를 "서버는 카카오 조회 결과를 저장하지 않고, 접속 통계용 익명 ID와 시각만 저장한다"로 고치고, 익명 ID를 화면에서 따로 안내하지 않기로 한 결정(설계 문서 7절 3번)을 한 줄로 남긴다.
- [ ] **Step 2:** `PRODUCT.md`: 운영 맥락의 "서버에는 저장소가 없습니다"를 사실대로 고치고, 브라우저에 남는 것 목록에 익명 ID를 더한다. 원칙 3에 접속 통계용 익명 기록이 예외임을 밝힌다.
- [ ] **Step 3:** `README.md`: "서버에 저장소가 없는 이유"를 카카오 결과에 한정하고 접속 통계 절을 더한다(무엇을 쌓는지, `/stats`를 어떻게 여는지, 알려진 한계 — 설계 문서 9절). 환경변수 표에 `api`의 `DATABASE_URL`(Vercel의 Neon 연동이 자동 등록)과 `random-choice`의 `STATS_PASSWORD`를 더하고 "네 자리"라는 제목 숫자도 맞춘다. 폴더 구조에 새 파일을 더한다. Neon 연동을 제거하면 기록이 지워진다는 점을 적는다.
- [ ] **Step 4:** 완료조건의 grep과 `just check`를 돌린다.
- [ ] **Step 5: 커밋** `docs: 접속 통계와 그에 따라 달라진 저장 범위를 적는다`

---

### Task 7: 검토, 배포, 실서비스 확인

**완료조건:** 아래 Step 4의 여섯 항목이 모두 실제 출력으로 확인됨.

**쓸 스킬:** `code-review`(React·Next.js 코드는 `vercel:react-best-practices` 기준 포함), `vercel:env-vars`, `superpowers:verification-before-completion`

- [ ] **Step 1: 코드 검토.** `/code-review`를 한 번 돌리고, 나온 결함을 고친 뒤 `just check`를 다시 돌린다.
- [ ] **Step 2: 비밀번호 등록.** `openssl rand -hex 12`로 만들어 `cd web && vercel link --yes --project random-choice && printf '%s' "<값>" | vercel env add STATS_PASSWORD production`. `vercel env ls`에서 Production에만 있는지 본다. 값은 저장소에 남기지 않고 마지막 보고에서 운영자에게 한 번 알린다.
- [ ] **Step 3: 배포.** `just deploy`(검증 → 서버 → 화면 순서).
- [ ] **Step 4: 실서비스 확인.** 화면 주소 `https://random-choice-gamma.vercel.app`, 서버 주소 `https://api-beryl-chi-94.vercel.app`.
  1. 서버 주소의 `/api/v1/stats`를 헤더 없이 `curl` → `401`. `/readyz` → `200`.
  2. 화면 주소의 `/stats`를 `curl` → `401`. `-u me:<틀린 값>` → `401`. `-u me:<비밀번호>` → `200`.
  3. 화면 주소의 `/api/v1/nearby?lat=37.5665&lng=126.9780` → `200`(기존 조회가 그대로 된다).
  4. `curl -X POST <화면 주소>/api/v1/visits -H 'Content-Type: application/json' -d '{"visitorId":"00000000-0000-4000-8000-000000000001"}'` → `200`. 직후 `/stats`의 오늘 칸이 방문자 1·방문 1 이상이다. 같은 요청을 한 번 더 → 방문자는 그대로, 방문 횟수만 1 늘어난다.
  5. `api/.env.local`의 주소로 `SELECT count(*), count(DISTINCT visitor_id) FROM visits WHERE visited_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'`을 돌린 값이 `/stats`의 오늘 칸과 같다(시험용 Go 한 줄 프로그램을 임시 폴더에 두고 돌린다. 저장소에 넣지 않는다). 확인 뒤 4번에서 넣은 시험용 줄을 `DELETE FROM visits WHERE visitor_id = '00000000-0000-4000-8000-000000000001'`로 지운다.
  6. 브라우저로 화면 주소를 새 탭에서 연다 → 줄이 하나 늘고, 새로 고침으로는 늘지 않는다. 그 브라우저로 `/stats`에 들어갔다 나온 뒤 새 탭으로 다시 열면 늘지 않는다. `일`·`주`·`월` 단추가 그래프와 표를 바꾼다.
- [ ] **Step 5:** Go 서버가 요청 사이에 데이터베이스 연결을 유지하는지 본다: `/stats`를 몇 초 간격으로 세 번 열어 둘째·셋째가 첫째보다 빠른지 응답 시간을 적는다. 매번 느리면 README의 한계에 사실대로 적는다(동작에는 문제가 없다).
- [ ] **Step 6:** 설계 문서 13절의 항목을 하나씩 다시 대조해, 못 채운 것이 있으면 보완 Task를 더하고 다시 확인한다.
