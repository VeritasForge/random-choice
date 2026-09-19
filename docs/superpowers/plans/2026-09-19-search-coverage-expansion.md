# 조회 범위 넓히기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 조회 지점을 다섯 곳(중심 + 400m 링 4곳)에서 중심 + 두 링(400m·800m, 각 4곳)으로 늘리고, 요청마다 그 두 링을 무작위 각도로 5번 돌려 조회한 결과를 합쳐서, 강남역 기준 커버리지를 11%에서 61%로 올린다. 이제 반경 숫자가 결과에 아무 영향을 주지 않으므로, 화면의 "1km/2km로 넓히기" 버튼을 반경을 언급하지 않는 "다시 찾아보기" 하나로 바꾼다.

**Architecture:** `api/internal/kakao/client.go`의 `SearchAround`가 고정된 네 방향 대신 회전 가능한 "링 점 생성기"를 쓰도록 다시 쓴다. 중심은 회전과 무관하게 요청당 1회만 조회한다. 화면 쪽은 `web/lib/radius.ts`의 반경-넓히기 로직을 통째로 걷어내고, `web/app/page.tsx`의 `start()`가 인자 없이 항상 같은 기본 반경으로 조회하도록 단순화한다.

**Tech Stack:** Go 1.26(`math/rand/v2`, `net/http/httptest`), Next.js/TypeScript(Vitest)

**Spec:** `docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md`

## Global Constraints

- Go 버전 1.26.7 이상(현재 `api/go.mod`에 고정된 값, 낮추지 않는다)
- 카카오 API 응답 결과는 어떤 형태로도 저장하지 않는다(캐싱 금지 — `api/internal/kakao/client.go` 패키지 주석 참고)
- 조회 전체 시간 상한(`kakao.DefaultSearchTimeout`, 12초)과 서버 응답 쓰기 상한(20초)의 순서를 뒤집지 않는다
- 새 의존성(패키지)을 추가하지 않는다 — `math/rand/v2`는 Go 표준 라이브러리다

---

## Task 1: `SearchAround`를 링 + 회전 방식으로 다시 쓴다 (Go)

**Files:**
- Modify: `api/internal/kakao/client.go:127-226` (`perimeterOffsetM` 상수와 `SearchAround` 함수 전체)
- Modify: `api/internal/kakao/client_test.go:826-857` (`TestSearchAroundMergesAllPoints`)
- Modify: `api/internal/kakao/client_test.go:861-922` (`TestSearchAroundRecomputesDistanceFromUserPosition`)
- Modify: `api/internal/kakao/client_test.go:998-1018` (`TestSearchAroundKeepsPlacesWithEmptyID`)
- Test: `api/internal/kakao/client_test.go` (새 시험 추가)

**Interfaces:**
- Consumes: 기존 `geo.Offset(lat, lng, northM, eastM float64) (float64, float64)`, `geo.DistanceMeters(lat1, lng1, lat2, lng2 float64) float64` — 그대로 재사용
- Produces: `SearchAround(ctx context.Context, lat, lng float64, radius int) ([]Place, error)` — 시그니처는 그대로. `Client` 구조체에 `randFloat func() float64` 필드가 새로 생긴다(시험에서 주입용).

### 1-1. `ringPoints` 헬퍼부터 만든다 (TDD)

- [ ] **Step 1: 실패하는 시험을 쓴다**

`api/internal/kakao/client_test.go` 맨 끝(파일 마지막 줄 다음)에 추가:

```go
func TestRingPointsPlacesPointsEvenlyAroundCenter(t *testing.T) {
	const lat, lng = 37.4979, 127.0276
	pts := ringPoints(lat, lng, 400, 4, 0) // 회전 없음(0라디안), 반경 400m, 점 4개
	if len(pts) != 4 {
		t.Fatalf("점 %d개, want 4개", len(pts))
	}
	// 회전이 0이면 점은 0도(북)·90도(동)·180도(남)·270도(서)에 놓인다.
	for i, wantDeg := range []float64{0, 90, 180, 270} {
		angle := wantDeg * math.Pi / 180
		wantLat, wantLng := geo.Offset(lat, lng, 400*math.Cos(angle), 400*math.Sin(angle))
		if pts[i].lat != wantLat || pts[i].lng != wantLng {
			t.Errorf("%d번째 점 = (%v,%v), want (%v,%v)", i, pts[i].lat, pts[i].lng, wantLat, wantLng)
		}
	}
}

func TestRingPointsAppliesRotation(t *testing.T) {
	const lat, lng = 37.4979, 127.0276
	rotation := 18.0 * math.Pi / 180 // 18도
	pts := ringPoints(lat, lng, 400, 4, rotation)
	// 첫 점은 회전각 그대로의 방향에 놓여야 한다.
	wantLat, wantLng := geo.Offset(lat, lng, 400*math.Cos(rotation), 400*math.Sin(rotation))
	if pts[0].lat != wantLat || pts[0].lng != wantLng {
		t.Errorf("회전이 반영되지 않았다. got (%v,%v), want (%v,%v)",
			pts[0].lat, pts[0].lng, wantLat, wantLng)
	}
}
```

이 두 시험을 쓰려면 파일 맨 위 import에 `"math"`와
`"github.com/VeritasForge/random-choice/api/internal/geo"`를 추가해야 한다
(지금 `client_test.go`에는 둘 다 없다). import 블록을 이렇게 바꾼다:

```go
import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/geo"
)
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `cd api && go test ./internal/kakao/... -run TestRingPoints -v`
Expected: 컴파일 오류(`undefined: ringPoints`). `ringPoints` 함수가 아직 없으므로 당연하다.

- [ ] **Step 3: `ringPoints` 헬퍼를 구현한다**

`api/internal/kakao/client.go`의 `perimeterOffsetM` 상수(127-136행)를 아래로
통째로 바꾼다:

```go
// innerRingRadiusM·outerRingRadiusM은 두 링의 반지름(m)이다.
//
// innerRingRadiusM(400m)의 근거: 2026-09-06 실측에서 네 지역(홍대입구·강남·판교·상계)
// 모두 중심이 실제로 보는 범위가 반경 100~160m였다. 400m 떨어진 지점의 원은
// 그것과 만날 수 없어 겹치는 가게가 0곳이었다.
//
// outerRingRadiusM(800m)의 근거와 두 링을 회전시켜 조회하기로 한 근거는
// docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md
// 3-1·3-3절에 있다 — 강남역 기준 커버리지가 11%에서 61%로 오른다.
const (
	innerRingRadiusM = 400.0
	outerRingRadiusM = 800.0
	// ringPointCount는 링 하나에 놓는 점의 개수다. 두 링 모두 같은 값을 쓴다.
	ringPointCount = 4

	// rotationSteps·rotationStepDeg·rotationRangeDeg는 요청 한 건 안에서
	// 링을 몇 번, 몇 도씩 돌려 조회할지를 정한다. 세 값은 서로 맞물려 있다 —
	// ringPointCount(4)가 90도마다 배치를 되풀이하므로(rotationRangeDeg),
	// 그 구간을 rotationSteps(5)걸음으로 고르게 나누면 rotationStepDeg(18도)가
	// 나온다. 하나를 바꾸면 나머지도 함께 봐야 한다.
	rotationSteps    = 5
	rotationStepDeg  = 18.0
	rotationRangeDeg = 90.0
)

// point는 조회할 좌표 하나다.
type point struct{ lat, lng float64 }

// ringPoints는 중심(lat,lng)에서 radiusM만큼 떨어진 자리에 count개의 점을
// rotationRad(라디안)만큼 돌려서 원 모양으로 늘어놓는다. count개 점은 서로
// (360/count)도 간격으로 놓인다.
//
// "링"이라는 이름의 근거: 중심에서 같은 거리에 있는 점들의 모임이 그리는 모양이
// 원(고리)이기 때문이다. 설계 문서 3-1절에 그림으로 설명해 두었다.
func ringPoints(lat, lng, radiusM float64, count int, rotationRad float64) []point {
	pts := make([]point, 0, count)
	for i := 0; i < count; i++ {
		angle := rotationRad + 2*math.Pi*float64(i)/float64(count)
		pLat, pLng := geo.Offset(lat, lng, radiusM*math.Cos(angle), radiusM*math.Sin(angle))
		pts = append(pts, point{pLat, pLng})
	}
	return pts
}
```

`client.go` 파일 맨 위 import 블록에는 이미 `"math"`가 있으므로 추가할 것이 없다.

- [ ] **Step 4: 시험이 통과하는지 확인한다**

Run: `cd api && go test ./internal/kakao/... -run TestRingPoints -v`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add api/internal/kakao/client.go api/internal/kakao/client_test.go
git commit -m "feat(api): 링 점 생성기(ringPoints) 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### 1-2. `SearchAround`가 링 + 회전을 쓰도록 바꾼다 (TDD)

- [ ] **Step 1: 실패하는 시험들을 쓴다**

`client_test.go`에 아래 두 시험을 추가한다(위치는 기존
`TestSearchAroundKeepsOneTimeBudgetForAllPoints` 뒤, 새로 추가한
`TestRingPoints*` 앞이면 된다):

```go
// 중심은 사용자 위치 그 자체라 각도를 돌려도 좌표가 바뀌지 않는다. 완전히 같은
// 좌표로 다시 물으면 완전히 같은 45곳이 돌아오므로(SearchRestaurants 시험이
// 이미 이것을 증명한다), 회전마다 중심을 다시 조회하면 매번 같은 45곳을
// 헛되이 반복해서 받는 것이다.
func TestSearchAroundQueriesCenterExactlyOnce(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276
	var mu sync.Mutex
	var centerHits int

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isCenterRequest(r, userLat, userLng) {
			mu.Lock()
			centerHits++
			mu.Unlock()
		}
		writeJSON(t, w, `{"documents":[],"meta":{"is_end":true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	if _, err := client.SearchAround(context.Background(), userLat, userLng, 500); err != nil {
		t.Fatalf("SearchAround = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if centerHits != 1 {
		t.Errorf("중심 좌표가 %d번 조회됐다. 회전 횟수(5회)와 무관하게 1번만 "+
			"조회해야 한다 — 재조회는 완전히 같은 45곳을 헛되이 반복해서 받는 것이다",
			centerHits)
	}
}

// randFloat 값이 실제로 회전 각도에 반영되는지 확인한다. 반영되지 않으면
// 모든 사용자가 영원히 같은 후보 풀에서만 뽑게 된다(설계 문서 3-3절).
func TestSearchAroundRotatesRingPointsUsingInjectedRandomness(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276

	capture := func(randFloat func() float64) map[string]bool {
		seen := map[string]bool{}
		var mu sync.Mutex
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			x, y := r.URL.Query().Get("x"), r.URL.Query().Get("y")
			mu.Lock()
			seen[x+","+y] = true
			mu.Unlock()
			writeJSON(t, w, `{"documents":[],"meta":{"is_end":true}}`)
		}))
		defer server.Close()

		client := NewClientWithBaseURL("key", server.URL, server.Client())
		client.randFloat = randFloat
		if _, err := client.SearchAround(context.Background(), userLat, userLng, 500); err != nil {
			t.Fatalf("SearchAround = %v", err)
		}
		return seen
	}

	first := capture(func() float64 { return 0 })
	second := capture(func() float64 { return 0.5 })

	if len(first) != 41 || len(second) != 41 {
		t.Fatalf("조회한 지점이 각각 %d곳, %d곳이다. 41곳(중심 1 + 링 40)이어야 한다",
			len(first), len(second))
	}

	overlap := 0
	for p := range first {
		if second[p] {
			overlap++
		}
	}
	// 중심 좌표 하나는 두 경우 모두 같으므로 최소 1곳은 겹친다. 링 지점까지
	// 크게 겹치면 randFloat 값이 회전 각도에 반영되지 않고 있다는 뜻이다.
	if overlap > 5 {
		t.Errorf("두 회전 시작값(0과 0.5)의 조회 지점이 %d곳이나 겹쳤다. "+
			"randFloat 값이 회전 각도에 반영되지 않고 있는 것으로 보인다", overlap)
	}
}

// 시작각 0도일 때 실제로 조회하는 마흔 개 링 점의 좌표가 설계 문서 3-1·3-3절의
// 공식(시작각 + 걸음 × 18도, 링마다 90도 간격 4점)과 정확히 일치하는지 못박는다.
func TestSearchAroundRingPointsMatchExpectedGeometry(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276
	var mu sync.Mutex
	seen := map[string]bool{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		x, y := r.URL.Query().Get("x"), r.URL.Query().Get("y")
		mu.Lock()
		seen[x+","+y] = true
		mu.Unlock()
		writeJSON(t, w, `{"documents":[],"meta":{"is_end":true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	client.randFloat = func() float64 { return 0 } // 시작각 0도
	if _, err := client.SearchAround(context.Background(), userLat, userLng, 500); err != nil {
		t.Fatalf("SearchAround = %v", err)
	}

	fmtCoord := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	for step := 0; step < rotationSteps; step++ {
		baseDeg := float64(step) * rotationStepDeg
		for _, radiusM := range []float64{innerRingRadiusM, outerRingRadiusM} {
			for i := 0; i < ringPointCount; i++ {
				angle := (baseDeg + float64(i)*90) * math.Pi / 180
				wantLat, wantLng := geo.Offset(userLat, userLng,
					radiusM*math.Cos(angle), radiusM*math.Sin(angle))
				key := fmtCoord(wantLng) + "," + fmtCoord(wantLat)
				if !seen[key] {
					t.Errorf("걸음 %d, 반경 %.0fm, %d번째 점(%s)이 조회되지 않았다",
						step, radiusM, i, key)
				}
			}
		}
	}
}
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `cd api && go test ./internal/kakao/... -run TestSearchAroundQueriesCenterExactlyOnce -v`
Expected: 컴파일 오류(`client.randFloat undefined`) — `Client`에 아직 그 필드가 없다.

- [ ] **Step 3: `randFloat` 필드를 추가하고 `SearchAround`를 다시 쓴다**

`client.go`의 `Client` 구조체(77-85행)를 이렇게 바꾼다:

```go
// Client는 카카오 로컬 API를 부른다.
type Client struct {
	apiKey  string
	baseURL string
	http    *http.Client
	// searchTimeout은 한 조회 전체의 상한이다. 시험에서 짧게 바꿔 쓸 수 있도록
	// 상수가 아니라 필드로 둔다 — 상수면 상한이 실제로 도는지 확인할 방법이 없다.
	searchTimeout time.Duration
	// randFloat는 [0,1) 사이의 값을 돌려준다. 회전 시작각을 무작위로 고르는 데
	// 쓴다. searchTimeout과 같은 이유로 상수가 아니라 필드로 둔다 — 시험에서
	// 고정값을 주입해야 회전 각도를 예측 가능하게 만들 수 있다.
	randFloat func() float64
}
```

`NewClient`와 `NewClientWithBaseURL`(87-105행)에 `randFloat: rand.Float64,`를
한 줄씩 추가한다:

```go
// NewClient는 실제 카카오를 가리키는 조회기를 만든다.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:        apiKey,
		baseURL:       defaultBaseURL,
		http:          &http.Client{Timeout: requestTimeout},
		searchTimeout: DefaultSearchTimeout,
		randFloat:     rand.Float64,
	}
}

// NewClientWithBaseURL은 시험에서 가짜 서버를 가리키게 할 때 쓴다.
func NewClientWithBaseURL(apiKey, baseURL string, hc *http.Client) *Client {
	return &Client{
		apiKey:        apiKey,
		baseURL:       baseURL,
		http:          hc,
		searchTimeout: DefaultSearchTimeout,
		randFloat:     rand.Float64,
	}
}
```

파일 맨 위 import 블록에 `"math/rand/v2"`를 추가한다(별칭 없이 `rand`로 쓴다):

```go
import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand/v2"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/geo"
)
```

**주의:** 1-1에서 상수 블록에 `ringPoints` 함수를 추가하며 줄이 늘어났으므로,
`SearchAround`의 실제 줄 번호는 원래(138-226행)보다 아래로 밀려 있다. 줄
번호로 찾지 말고 `func (c *Client) SearchAround(` 로 시작해 그 함수를 닫는
중괄호까지, 함수 전체(위에 붙은 문서 주석 포함)를 찾아 아래 내용으로
통째로 바꾼다:

```go
// SearchAround는 사용자 위치와, 그 둘레 두 링(400m·800m, 각 4곳)을 요청마다
// 무작위 각도로 5번 돌려 조회한 결과를 합친다.
//
// 왜 한 지점으로 부족한가: 카카오는 한 조회에 가까운 45곳까지만 준다. 사람이
// 많은 곳에서는 그 45곳이 반경 100~160m 안에 다 들어가서, 반경을 넓혀도
// 목록이 같다. 링을 여러 개 두고 회전시켜 조회하는 근거와 실측 수치는
// docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md에 있다
// (강남역 기준 커버리지 11% → 61%).
//
// 중심은 요청당 딱 1회만 조회한다. 중심은 사용자의 실제 위치이므로 각도를
// 아무리 돌려도 좌표가 바뀌지 않고, 완전히 같은 좌표로 다시 물으면 완전히
// 같은 45곳이 돌아온다 — 회전마다 중심을 다시 조회하면 매번 같은 45곳을
// 헛되이 반복해서 받는 것이다.
//
// 돌려주는 모든 Place.Distance는 카카오가 준 값이 아니라 사용자가 준
// lat,lng 기준으로 다시 계산한 값이다. 카카오의 거리는 조회 중심 기준이라
// 그대로 쓰면 412m가 24m로 표시된다.
//
// 돌려주는 목록은 그 거리의 **오름차순**이다. 여러 지점을 합친 결과를 병합 순서
// 그대로 주면 조회기로서 이상한 계약이라, 여기서 약속하고 여기서 지킨다.
// 부르는 쪽인 httpapi도 자기 응답을 따로 정렬한다 — 조회기를 갈아 끼우면 이쪽
// 약속만 조용히 사라지므로, 두 자리 모두 자기 약속을 자기가 지킨다.
func (c *Client) SearchAround(ctx context.Context, lat, lng float64, radius int) ([]Place, error) {
	// 전체 조회의 시간 상한. 안쪽 SearchRestaurants도 각자 상한을 열지만,
	// 이미 마감이 잡힌 부모에서 파생되므로 더 이른 이쪽 마감을 물려받는다.
	// 이 줄이 없으면 중심(≤12초)과 링(≤12초)의 예산이 더해져 최악 24초가 되고,
	// 서버의 응답 쓰기 상한(20초)과 화면 요청 상한(20초)을 넘어선다 —
	// 안쪽이 바깥쪽보다 짧아야 한다는 순서가 뒤집힌다.
	ctx, cancel := context.WithTimeout(ctx, c.searchTimeout)
	defer cancel()

	// 중심을 먼저 부른다. 링 점을 한꺼번에 쏘면 우리 요청 하나가 카카오 호출을
	// 마흔 개 동시에 내는데, 429가 순간 호출 제한이라면 사용자가 한 명뿐일 때도
	// 그중 몇 개가 튕긴다. 하필 중심이 튕기면 전체가 실패로 답해진다.
	center, err := c.SearchRestaurants(ctx, lat, lng, radius)
	if err != nil {
		return nil, err
	}

	// 시작각을 [0, 90도) 사이에서 무작위로 하나 뽑는다. 두 링 모두 점이
	// ringPointCount(4)개씩이라 90도를 돌리면 점들이 서로 자리를 맞바꿔
	// 처음과 같은 배치가 되므로, 완전히 새로운 배치를 볼 수 있는 범위가
	// 그 구간뿐이다. 시작각을 고정하지 않는 이유: 고정하면 모든 사용자가
	// 영원히 똑같은 후보 풀에서만 뽑게 된다.
	startRad := c.randFloat() * rotationRangeDeg * math.Pi / 180

	// 5번 회전하며 두 링(400m·800m)의 점을 모은다. 중심은 위에서 이미
	// 한 번 조회했으므로 여기서 다시 넣지 않는다.
	points := make([]point, 0, rotationSteps*ringPointCount*2)
	for step := 0; step < rotationSteps; step++ {
		angle := startRad + float64(step)*rotationStepDeg*math.Pi/180
		points = append(points, ringPoints(lat, lng, innerRingRadiusM, ringPointCount, angle)...)
		points = append(points, ringPoints(lat, lng, outerRingRadiusM, ringPointCount, angle)...)
	}

	// 링 점들은 보강이다. 하나가 실패해도 그 지점만 버리고 계속한다 —
	// 각 지점이 독립적으로 완전하거나 통째로 없으므로, 하나가 빠져도
	// 남은 것들의 분포는 온전하다.
	results := make([][]Place, len(points))
	var wg sync.WaitGroup
	for i, p := range points {
		wg.Add(1)
		go func(i int, p point) {
			defer wg.Done()
			found, err := c.SearchRestaurants(ctx, p.lat, p.lng, radius)
			if err != nil {
				slog.Warn("링 지점 조회에 실패해 그 지점을 건너뜁니다",
					"error", err.Error())
				return
			}
			results[i] = found
		}(i, p)
	}
	wg.Wait()

	merged := make([]Place, 0, len(center)+len(points)*pageSize*maxPages)
	seen := make(map[string]struct{}, cap(merged))
	add := func(places []Place) {
		for _, p := range places {
			// 식별자가 빈 건은 중복 판정을 할 수 없다. 하나로 뭉뚱그리면
			// 멀쩡한 가게들이 사라지므로 그냥 그대로 살린다.
			if p.ID != "" {
				if _, duplicate := seen[p.ID]; duplicate {
					continue
				}
				seen[p.ID] = struct{}{}
			}
			p.Distance = int(geo.DistanceMeters(lat, lng, p.Lat, p.Lng) + 0.5)
			merged = append(merged, p)
		}
	}
	add(center)
	for _, r := range results {
		add(r)
	}

	sort.Slice(merged, func(i, j int) bool { return merged[i].Distance < merged[j].Distance })
	return merged, nil
}
```

- [ ] **Step 4: 새 시험들이 통과하는지 확인한다**

Run: `cd api && go test ./internal/kakao/... -run 'TestSearchAroundQueriesCenterExactlyOnce|TestSearchAroundRotatesRingPointsUsingInjectedRandomness|TestSearchAroundRingPointsMatchExpectedGeometry' -v`
Expected: PASS (3 tests)

- [ ] **Step 5: 지점 수가 바뀌어 깨지는 기존 시험 세 개를 고친다**

`TestSearchAroundMergesAllPoints`(기존 827-857행)에서 `len(places) != 5`와
`len(seenPoints) != 5`를 각각 `41`로 바꾼다:

```go
	if len(places) != 41 {
		t.Fatalf("받은 가게 %d곳, want 41곳 (중심 1 + 링 40, 지점마다 하나씩)", len(places))
	}
	if len(seenPoints) != 41 {
		t.Errorf("조회한 지점 %d곳, want 41곳", len(seenPoints))
	}
```

`TestSearchAroundRecomputesDistanceFromUserPosition`(기존 861-922행)에서
`len(places) != 5`를 `41`로 바꾼다:

```go
	if len(places) != 41 {
		t.Fatalf("받은 가게 %d곳, want 41곳 (중심 1 + 링 40, 지점마다 하나씩)", len(places))
	}
```

`TestSearchAroundKeepsPlacesWithEmptyID`(기존 998-1018행)에서
`len(places) != 5`를 `41`로 바꾼다:

```go
	if len(places) != 41 {
		t.Errorf("식별자가 빈 가게 %d곳이 남았다, want 41곳 — "+
			"빈 식별자로 중복 판정을 하면 멀쩡한 가게들이 서로를 지운다", len(places))
	}
```

- [ ] **Step 6: 패키지 전체 시험을 돌린다**

Run: `cd api && go test ./internal/kakao/... -v`
Expected: PASS 전체(느린 시험 포함, 30초 안팎 예상 — 링 점이 40개로 늘어
`TestSearchAroundKeepsOneTimeBudgetForAllPoints` 등에서 동시 연결 수가
늘지만 통과에는 영향이 없다). 실패하면 어느 시험인지 보고 고친다.

- [ ] **Step 7: 서버 쪽 전체 검사를 돌린다**

Run: `cd api && go build ./... && go vet ./... && gofmt -l .`
Expected: 오류 없음, `gofmt -l .`은 아무 파일도 출력하지 않는다(포맷이 이미 맞다는 뜻).
포맷이 안 맞는 파일이 나오면 `gofmt -w <파일>`로 고친다.

- [ ] **Step 8: 커밋**

```bash
git add api/internal/kakao/client.go api/internal/kakao/client_test.go
git commit -m "feat(api): SearchAround를 링 두 개 + 회전 5회 방식으로 다시 쓴다

지점 배치가 고정된 동서남북 네 곳에서, 요청마다 무작위 각도로
5번 회전시켜 조회하는 두 링(400m·800m, 각 4곳)으로 바뀐다.
중심은 회전과 무관하게 요청당 1회만 조회한다.

강남역 실측 기준 커버리지가 11%(222/1978곳)에서 61%(1214/1978곳)로
오른다. 설계 근거는
docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md
참고.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: "반경 넓히기"를 "다시 찾아보기"로 바꾼다 (화면)

**Files:**
- Modify: `web/lib/radius.ts` (전체 — `WIDER_RADII`·`widerThan` 제거, `DEFAULT_RADIUS`만 남긴다)
- Delete: `web/lib/radius.test.ts` (남는 내용이 없어진다)
- Modify: `web/app/page.tsx` (`View` 타입, `start` 함수, 빈 결과 화면 부분)
- Modify: `web/components/Notice.tsx:16-19` (더 이상 맞지 않는 예시 주석 한 줄)

**Interfaces:**
- Consumes: 없음(이 작업은 기존 상수·컴포넌트만 정리한다)
- Produces: `start(): Promise<void>` — 기존에는 `start(radius: number)`였다. 이 파일을 보는 다음 작업자는 `radius` 인자를 넘기지 않는다.

### 2-1. `radius.ts`에서 반경 넓히기 로직을 걷어낸다

- [ ] **Step 1: `radius.ts`를 `DEFAULT_RADIUS`만 남기고 정리한다**

`web/lib/radius.ts` 전체를 이렇게 바꾼다:

```ts
/** 조회에 쓰는 반경(m). 카카오는 한 조회에 가까운 45곳까지만 주고 그 상한은
 * 반경 값과 무관하므로(실측으로 확인됨 — 500m로 물어도 5km로 물어도 똑같은
 * 45곳이 온다), 이 값은 서버가 요구하는 파라미터를 채우는 역할만 한다. */
export const DEFAULT_RADIUS = 500;
```

- [ ] **Step 2: 이제 내용이 없어진 `radius.test.ts`를 지운다**

```bash
git rm web/lib/radius.test.ts
```

- [ ] **Step 3: 컴파일이 깨지는지 확인한다(아직 page.tsx를 안 고쳤으므로 깨져야 정상)**

Run: `cd web && npx tsc --noEmit`
Expected: FAIL — `web/app/page.tsx`에서 `widerThan`을 찾을 수 없다는 오류.

- [ ] **Step 4: 커밋 (다음 스텝에서 page.tsx와 함께 고쳐지므로, 이 스텝은 건너뛰고 2-2로 이어간다)**

이 작업은 `radius.ts` 단독으로는 컴파일이 깨지므로 커밋하지 않고 바로
2-2로 넘어간다.

### 2-2. `page.tsx`를 단순화한다

- [ ] **Step 1: `View` 타입에서 `radius` 필드를 뺀다**

`web/app/page.tsx`의 `View` 타입(51-82행)을 이렇게 바꾼다. 그 위에 있던
"empty와 error가 radius를 함께 들고 다니는 이유" 주석(47-49행)은 그 이유
자체가 사라지므로 함께 지운다:

```ts
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "candidates"; result: NearbyResult; candidates: Cuisine[] }
  | {
      kind: "result";
      /**
       * 고른 종류의 가게 **전부**. 회피를 적용하기 **전**의 목록이다.
       * 회피를 껐을 때 빠졌던 가게를 되돌리려면 이것이 있어야 한다 —
       * 걸러진 pool만 들고 있으면 스위치를 꺼도 가게가 돌아오지 않는다.
       */
      cuisine: Cuisine;
      all: Place[];
      /**
       * 회피를 적용한 뒤 남은 가게. 뽑기의 바탕이다.
       * places와 나눠 들고 다니는 이유: "다른 가게 보기"는 이 목록에서 다시 뽑는데,
       * 누를 때마다 목록을 새로 걸러 만들면 같은 가게라도 다른 객체가 되어
       * 직전 목록을 피하는 판정이 통하지 않는다(web/lib/places.ts에 까닭을 적어 두었다).
       */
      pool: Place[];
      /** 지금 화면에 보이는 가게. */
      places: Place[];
      /** 지금 창 크기. "다른 가게 보기"가 WINDOW_STEP씩 키운다. */
      windowSize: number;
      /** 회피가 몇 곳을 뺐는지. released와 반드시 함께 읽는다(web/lib/avoid.ts). */
      removed: number;
      /** 전부 빠져 이번만 회피를 풀었는지. */
      released: boolean;
    }
  | { kind: "visits" }
  | { kind: "empty" }
  | { kind: "error"; code: string; message: string };
```

(`result` variant의 필드 순서·내용은 원래와 같다 — `cuisine` 필드 위치만
주석을 옮기며 살짝 바뀌었을 뿐 값 자체는 그대로다. 원래 파일과 대조해
필드가 하나도 빠지지 않았는지 확인한다: `cuisine`, `all`, `pool`, `places`,
`windowSize`, `removed`, `released`.)

- [ ] **Step 2: import에서 `widerThan`을 뺀다**

22행을 이렇게 바꾼다:

```ts
import { DEFAULT_RADIUS } from "@/lib/radius";
```

- [ ] **Step 3: `start` 함수를 인자 없이 바꾸고, 모든 `setView`에서 `radius`를 뺀다**

**주의:** 위 Step 1에서 줄 3개(옛 주석)를 지웠으므로 아래에 적히는 줄 번호는
전부 원래 파일보다 몇 줄 위로 밀려 있다. 줄 번호 대신 `async function start(`로
시작해 그 함수를 닫는 중괄호까지, `start` 함수 전체를 찾아 이렇게 바꾼다:

```ts
  async function start() {
    setView({ kind: "loading" });

    try {
      const coords = await getCurrentPosition();
      const result = await fetchNearby(coords.lat, coords.lng, DEFAULT_RADIUS);
      const cuisines = distinctById(result.cuisines);
      if (cuisines.length === 0) {
        setView({ kind: "empty" });
        return;
      }
      setView({
        kind: "candidates",
        result,
        candidates: pickDistinct(cuisines, CANDIDATE_COUNT, Math.random),
      });
    } catch (error) {
      // 오류의 출처가 셋이고, 각각 코드를 담는 방식이 다르다.
      // 어느 쪽도 아닌 오류는 우리가 예상하지 못한 것이므로, 원본을 콘솔에 남긴다 —
      // 남기지 않으면 사용자에게는 일반 안내만 뜨고 개발자에게는 단서가 하나도 없다.
      if (error instanceof NearbyError) {
        // 상태 코드를 콘솔에 남긴다. 남기지 않으면 "프록시가 목적지에 못 닿았다"와
        // "서버가 스스로 500을 냈다"의 구분이 던져진 다음 프레임에서 사라진다.
        console.error("[start] 조회 실패", error.code, error.status);
        setView({ kind: "error", code: error.code, message: error.message });
        return;
      }
      if (error instanceof GeoError) {
        setView({ kind: "error", code: error.code, message: "" });
        return;
      }
      console.error("[start] 예상하지 못한 오류", error);
      setView({ kind: "error", code: "unexpected", message: "" });
    }
  }
```

- [ ] **Step 4: `widerRadii` 계산 줄을 지운다**

아래 두 줄(주석 포함)을 통째로 지운다. `grep -n "widerRadii" web/app/page.tsx`로
정확한 위치를 찾을 수 있다:

```ts
  // 이미 실패한 반경 이하는 제안하지 않는다(까닭은 lib/radius.ts에 적어 두었다).
  const widerRadii = view.kind === "empty" ? widerThan(view.radius) : [];
```

- [ ] **Step 5: 나머지 `start(...)` 호출과 빈 결과 화면을 고친다**

`onStart={() => start(DEFAULT_RADIUS)}`(`StartScreen`에 넘기는 자리 —
`grep -n "onStart=" web/app/page.tsx`로 찾는다)를:

```tsx
          onStart={() => start()}
```

`view.kind === "empty" && (` 로 시작하는 블록을 통째로 이렇게 바꾼다
(`grep -n 'view.kind === "empty"' web/app/page.tsx`로 찾는다):

```tsx
      {view.kind === "empty" && (
        <Notice
          title="주변에서 음식점을 찾지 못했어요"
          description="다시 찾아볼까요?"
          actions={[{ label: "다시 찾아보기", onClick: () => start() }]}
        />
      )}
```

`view.kind === "error"` 블록 안의 `onClick: () => start(view.radius)`
(`grep -n "start(view.radius)" web/app/page.tsx`로 찾는다)를:

```tsx
              ? [{ label: "다시 시도", onClick: () => start() }]
```

- [ ] **Step 6: `Notice.tsx`의 더 이상 맞지 않는 예시 주석을 고친다**

`web/components/Notice.tsx:16-19`의 주석에서 "반경을 넓히는 화면" 예시가
사라지는 기능을 가리키므로 지운다. 아래처럼 일반 규칙 설명만 남긴다:

```tsx
            /*
              맨 앞의 것만 강조색으로 칠한다. 막다른 화면에서 다음 걸음이 무엇인지
              한눈에 보여야 하고, 강조색이 둘 이상이면 그 구실을 못 한다.
            */
```

- [ ] **Step 7: 남은 참조가 없는지 확인한다**

Run: `cd web && grep -rn "widerThan\|WIDER_RADII\|view\.radius" app/ lib/ components/`
Expected: 아무 결과도 나오지 않는다(빈 출력).

- [ ] **Step 8: 타입 검사·시험·빌드를 돌린다**

Run: `cd web && npx tsc --noEmit && npx vitest run && npm run build`
Expected: 셋 다 오류 없이 끝난다.

- [ ] **Step 9: 커밋**

```bash
git add web/lib/radius.ts web/app/page.tsx web/components/Notice.tsx
git commit -m "fix(web): 반경 넓히기 버튼을 반경을 언급하지 않는 다시 찾아보기로 바꾼다

조회 지점이 회전 방식으로 바뀌며 반경 숫자가 결과에 아무 영향을
주지 않게 됐다(설계 문서 4절). '1km로 넓히기' 같은 문구는 더 이상
사실이 아니므로, 반경을 언급하지 않는 '다시 찾아보기' 버튼 하나로
바꾼다. View 상태에서도 이제 쓸모없어진 radius 필드를 걷어낸다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: 전체 검증과 README 반영

**Files:**
- Modify: `README.md` (반경·다섯 지점 관련 서술)
- Modify: `docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md`의 완료 조건 체크박스

**Interfaces:**
- Consumes: Task 1·2가 만든 최종 동작
- Produces: 없음(문서·검증 마무리 작업)

### 3-1. 전체 검사

- [ ] **Step 1: `just check`를 돌린다**

Run: `just check`
Expected: 종료 코드 0(서버 시험·검사, 화면 빌드·시험·타입·린트 전부 통과).
실패하면 어느 단계인지 보고 Task 1·2로 돌아가 고친다.

- [ ] **Step 2: 실제 카카오 응답으로 커버리지를 재본다(수동 확인)**

`just api`로 API 서버만 띄운다(`Justfile`에 이미 있는 레시피 — `api/.env`의
`KAKAO_REST_API_KEY`를 자동으로 읽고, 포트 8090에서 뜬다). 로컬 개발에서는
보통 `INTERNAL_API_KEY`를 설정하지 않으므로(README "비밀값" 절 참고),
그 경우 헤더 없이 강남역 좌표로 바로 조회한다:

```bash
just api &
sleep 2
curl -s "http://localhost:8090/api/v1/nearby?lat=37.4979&lng=127.0276&radius=500" | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('받은 가게 수:', len(d['places']))
"
kill %1
```

로컬에 `INTERNAL_API_KEY`를 설정해 두었다면 위 curl 명령에
`-H "X-Internal-Key: $INTERNAL_API_KEY"`를 추가한다(헤더 이름은
`api/internal/httpapi/handler.go`의 `internalKeyHeader` 상수 값이다).

Expected: 받은 가게 수가 대략 1,100~1,350곳 사이(설계 문서 완료 조건의
55~65% 범위, 카카오가 그날 세는 총 개수에 따라 조금씩 달라진다). 이
숫자는 카카오 원본 응답 기준이며 술집 등을 거르기 전 값이다(설계
문서 5절 4번 항목 참고) — 화면에 실제로 보이는 종류별 카드 수는
이보다 적다.

- [ ] **Step 3: README를 실제 동작에 맞춘다**

`README.md`에서 "다섯 지점", "반경을 넓혀도 결과가 달라지지 않습니다"류
서술을 찾아(`grep -n "다섯 지점\|반경을 넓혀도" README.md`) 이번 변경
내용(두 링·회전 5회·61% 커버리지)에 맞게 고친다. 정확한 문구는 설계
문서 1·2·4절을 옮겨 쓰면 된다 — 새로 조사할 내용은 없다.

- [ ] **Step 4: 설계 문서의 완료 조건 체크박스를 채운다**

`docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md`의
"6. 완료 조건" 목록을 하나씩 이 계획의 결과와 대조해 `- [ ]`를 `- [x]`로
바꾼다. 대조가 안 되는 항목(예: 다른 지역 재측정)이 있으면 그대로
`- [ ]`로 남겨 두고 이유를 한 줄 덧붙인다.

- [ ] **Step 5: 커밋**

```bash
git add README.md docs/superpowers/specs/2026-09-19-search-coverage-expansion-design.md
git commit -m "docs: 조회 범위 넓히기 반영 — README 갱신, 완료 조건 대조

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
