# 점심 결정 서비스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저 위치를 받아 주변 음식점에서 음식 종류를 추려 무작위로 좁혀 주는 웹 서비스를 만든다.

**Architecture:** 브라우저(Next.js)가 위치를 얻어 Go 서버에 넘기고, Go 서버가 카카오 로컬 API를 실시간으로 호출해 음식점 목록과 음식 종류 집계를 돌려준다. 서버에는 어떤 저장소도 두지 않는다. 무작위 추첨은 브라우저가 이미 받은 목록 안에서 수행해 다시 뽑기가 추가 호출 없이 즉시 끝나게 한다.

**Tech Stack:** Go 1.26 (표준 라이브러리만) / Next.js 16.3.3 · React 19.2.8 · TypeScript 5 · Tailwind CSS 4 / 시험은 Go 표준 `testing` + `httptest`, 화면은 Vitest 4

**Spec:** `docs/superpowers/specs/2026-08-29-lunch-random-picker-design.md`

## Global Constraints

이 절의 규칙은 모든 Task에 예외 없이 적용된다.

- **Go 모듈 경로**: `github.com/VeritasForge/random-choice/api`. Go 최소 버전 `1.26`.
- **Go는 표준 라이브러리만 쓴다.** 외부 의존성을 추가하지 않는다. (`api/go.mod`의 `require` 블록은 비어 있어야 한다)
- **저장소를 만들지 않는다.** 데이터베이스, 서버 메모리 캐시, 파일 저장, 브라우저의 `localStorage`·`sessionStorage`·쿠키 중 어느 것도 쓰지 않는다. 카카오가 결과 저장을 금지했기 때문이다.
- **시험은 실제 카카오를 부르지 않는다.** 카카오 호출이 필요한 시험은 `net/http/httptest`로 가짜 서버를 띄워 대신한다. 그래야 열쇠와 네트워크 없이도 항상 같은 결과가 나온다.
- **열쇠를 소스에 넣지 않는다.** 카카오 열쇠는 환경변수 `KAKAO_REST_API_KEY`로만 읽는다. 시험용 가짜 열쇠 문자열은 `test-key`처럼 누가 봐도 가짜인 값을 쓴다.
- **사용자에게 보이는 모든 문구는 한국어**로 쓴다.
- **음식 종류 문자열의 구분자는 ` > `** (공백-꺾쇠-공백) 하나로 통일한다. Go가 만들고 화면이 그대로 표시하므로 양쪽이 어긋나면 안 된다.
- **각 Task를 끝낼 때마다** 그 Task의 "완료 확인" 명령을 실제로 돌려 통과를 눈으로 본 뒤 커밋한다. 통과하지 않은 채로 다음 Task로 넘어가지 않는다.

---

## 파일 구성

Task를 나누기 전에 어떤 파일이 무엇을 책임지는지 먼저 못 박는다.

| 파일 | 책임 | 만드는 Task |
|------|------|------------|
| `api/go.mod` | Go 모듈 선언 | 1 |
| `api/internal/cuisine/cuisine.go` | 카카오 분류 문자열을 음식 종류로 바꾸고 개수를 센다. 바깥과 닿지 않는 순수 계산 | 1 |
| `api/internal/cuisine/cuisine_test.go` | 위 규칙의 시험 | 1 |
| `api/internal/kakao/client.go` | 카카오 로컬 API를 부르는 유일한 창구. 응답을 우리 형태로 옮긴다 | 2 |
| `api/internal/kakao/client_test.go` | 가짜 카카오 서버로 위 동작을 시험 | 2 |
| `api/internal/httpapi/handler.go` | 요청 값을 검사하고, 조회기를 부르고, 응답 형태를 만든다 | 3 |
| `api/internal/httpapi/handler_test.go` | 가짜 조회기로 요청·응답 규칙을 시험 | 3 |
| `api/cmd/server/main.go` | 환경변수를 읽어 서버를 켠다 | 3 |
| `web/lib/pick.ts` | 무작위 추첨 규칙. 난수 생성기를 밖에서 받는 순수 함수 | 4 |
| `web/lib/pick.test.ts` | 추첨 규칙의 시험 | 4 |
| `web/lib/api.ts` | Go 서버를 부르고 오류를 코드로 옮긴다 | 5 |
| `web/lib/api.test.ts` | 가짜 `fetch`로 위 동작을 시험 | 5 |
| `web/lib/geo.ts` | 브라우저에 현재 위치를 묻는다 | 5 |
| `web/components/StartScreen.tsx` | 화면 1 — 시작 | 6 |
| `web/components/CandidateScreen.tsx` | 화면 2 — 후보 고르기 | 6 |
| `web/components/ResultScreen.tsx` | 화면 3 — 결과 | 6 |
| `web/components/Notice.tsx` | 오류·빈 결과 안내 (제목 + 설명 + 버튼들) | 6 |
| `web/app/page.tsx` | 세 화면 사이의 이동을 관리한다 | 6 |
| `web/next.config.ts` | 브라우저의 `/api` 요청을 Go 서버로 넘긴다 | 4 |

**왜 이렇게 나눴나.** `cuisine`은 바깥과 닿지 않아 가장 시험하기 쉬우므로 먼저 만든다. `kakao`는 바깥과 닿는 유일한 곳이라 따로 떼어 가짜 서버로 시험한다. `httpapi`는 둘을 이어 붙이기만 한다. 화면 쪽도 같은 원리로, 계산(`pick.ts`)과 통신(`api.ts`)을 화면(`components/`)에서 분리해 각각 따로 시험한다.

---

## Task 1: 음식 종류 변환기

카카오가 주는 `"음식점 > 한식 > 육류,고기 > 곱창,막창"` 같은 문자열을 `"한식 > 육류,고기"`로 바꾸고, 종류별로 개수를 세는 부분이다. 바깥 세상에 닿지 않으므로 가장 먼저 만든다.

**Files:**
- Create: `api/go.mod`
- Create: `api/internal/cuisine/cuisine.go`
- Test: `api/internal/cuisine/cuisine_test.go`

**Interfaces:**
- Consumes: 없음 (첫 Task)
- Produces:
  - `func cuisine.Extract(categoryName string) string` — 분류 문자열 하나를 음식 종류 하나로. 만들 수 없으면 빈 문자열.
  - `type cuisine.Tally struct { Name string; Count int }`
  - `func cuisine.CountByName(cuisines []string) []Tally` — 개수 많은 순, 같으면 이름 오름차순.

- [ ] **Step 1: Go 모듈을 만든다**

```bash
mkdir -p api/internal/cuisine api/internal/kakao api/internal/httpapi api/cmd/server
cd api && go mod init github.com/VeritasForge/random-choice/api && cd ..
cat api/go.mod
```

`go.mod`에 `module github.com/VeritasForge/random-choice/api`와 `go 1.26`(또는 설치된 Go의 버전)이 들어 있으면 된다.

- [ ] **Step 2: 실패하는 시험을 쓴다**

`api/internal/cuisine/cuisine_test.go`:

```go
package cuisine

import "testing"

func TestExtract(t *testing.T) {
	tests := []struct {
		name  string
		given string
		want  string
	}{
		{"네 단계면 앞의 두 단계만 남긴다", "음식점 > 한식 > 육류,고기 > 곱창,막창", "한식 > 육류,고기"},
		{"두 단계면 한 단계만 남는다", "음식점 > 분식", "분식"},
		{"세 단계면 두 단계가 남는다", "음식점 > 일식 > 돈까스", "일식 > 돈까스"},
		{"음식점만 있으면 남는 것이 없다", "음식점", ""},
		{"빈 문자열은 빈 문자열", "", ""},
		{"앞뒤 공백은 없앤다", "  음식점  >  한식  ", "한식"},
		{"음식점 접두어가 없어도 동작한다", "한식 > 육류,고기", "한식 > 육류,고기"},
		{"빈 조각은 건너뛴다", "음식점 >  > 분식", "분식"},
		{"구분자가 없으면 통째로 한 단계", "분식", "분식"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Extract(tt.given); got != tt.want {
				t.Errorf("Extract(%q) = %q, 원하는 값 %q", tt.given, got, tt.want)
			}
		})
	}
}

func TestCountByName(t *testing.T) {
	got := CountByName([]string{"한식", "분식", "한식", "일식 > 돈까스", "분식", "한식"})
	want := []Tally{
		{Name: "한식", Count: 3},
		{Name: "분식", Count: 2},
		{Name: "일식 > 돈까스", Count: 1},
	}
	if len(got) != len(want) {
		t.Fatalf("길이가 %d, 원하는 길이 %d (%+v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%d번째가 %+v, 원하는 값 %+v", i, got[i], want[i])
		}
	}
}

func TestCountByNameSortsTiesByName(t *testing.T) {
	got := CountByName([]string{"중식", "분식", "양식"})
	want := []string{"분식", "양식", "중식"}
	for i := range want {
		if got[i].Name != want[i] {
			t.Errorf("%d번째가 %q, 원하는 값 %q (전체 %+v)", i, got[i].Name, want[i], got)
		}
	}
}

func TestCountByNameEmptyReturnsEmptySlice(t *testing.T) {
	got := CountByName(nil)
	if got == nil {
		t.Fatal("nil이 아니라 빈 슬라이스를 돌려줘야 한다. JSON으로 바꿀 때 null이 아닌 []가 나와야 하기 때문이다")
	}
	if len(got) != 0 {
		t.Errorf("길이가 %d, 원하는 길이 0", len(got))
	}
}
```

- [ ] **Step 3: 시험이 실패하는지 확인한다**

```bash
cd api && go test ./internal/cuisine/ -v
```

기대: 컴파일 실패. `undefined: Extract`, `undefined: Tally`, `undefined: CountByName`.

- [ ] **Step 4: 통과할 만큼만 구현한다**

`api/internal/cuisine/cuisine.go`:

```go
// Package cuisine은 카카오가 주는 분류 문자열을 사람이 읽는 음식 종류로 바꾼다.
package cuisine

import (
	"sort"
	"strings"
)

const (
	// rootCategory는 모든 음식점에 똑같이 붙는 맨 앞 조각이라 정보가 없다.
	rootCategory = "음식점"
	// maxDepth는 음식 종류로 남길 조각 수다.
	// 1개면 "한식"에 절반이 몰려 좁혀지지 않고,
	// 3개면 "한식 > 육류,고기 > 곱창,막창"처럼 잘게 쪼개져 후보가 전부 1곳짜리가 된다.
	maxDepth = 2
	// separator는 조각을 잇는 문자열이다. 화면도 이 형태를 그대로 보여준다.
	separator = " > "
)

// Tally 하나는 음식 종류 하나와 그 종류에 해당하는 가게 수다.
type Tally struct {
	Name  string
	Count int
}

// Extract는 카카오의 category_name을 음식 종류로 바꾼다.
// 예: "음식점 > 한식 > 육류,고기 > 곱창,막창" -> "한식 > 육류,고기"
// 남는 조각이 없으면 빈 문자열을 돌려준다. 부르는 쪽은 이때 그 가게를 결과에서 뺀다.
func Extract(categoryName string) string {
	var segments []string
	for _, part := range strings.Split(categoryName, ">") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			segments = append(segments, trimmed)
		}
	}
	if len(segments) > 0 && segments[0] == rootCategory {
		segments = segments[1:]
	}
	if len(segments) == 0 {
		return ""
	}
	if len(segments) > maxDepth {
		segments = segments[:maxDepth]
	}
	return strings.Join(segments, separator)
}

// CountByName은 음식 종류별 가게 수를 센다.
// 가게 수가 많은 순으로, 같으면 이름 오름차순으로 정렬한다 —
// 같은 입력이면 언제나 같은 순서가 나와야 시험할 수 있기 때문이다.
func CountByName(cuisines []string) []Tally {
	counts := make(map[string]int, len(cuisines))
	for _, name := range cuisines {
		counts[name]++
	}
	tallies := make([]Tally, 0, len(counts))
	for name, count := range counts {
		tallies = append(tallies, Tally{Name: name, Count: count})
	}
	sort.Slice(tallies, func(i, j int) bool {
		if tallies[i].Count != tallies[j].Count {
			return tallies[i].Count > tallies[j].Count
		}
		return tallies[i].Name < tallies[j].Name
	})
	return tallies
}
```

- [ ] **Step 5: 시험이 통과하는지 확인한다**

```bash
cd api && go test ./internal/cuisine/ -v && go vet ./...
```

기대: 모든 시험 PASS, `go vet`은 아무 말도 하지 않음.

- [ ] **Step 6: 커밋한다**

```bash
git add api/go.mod api/internal/cuisine/
git commit -m "feat(api): 카카오 분류 문자열을 음식 종류로 바꾸는 규칙 추가"
```

**완료 확인:** `cd api && go test ./internal/cuisine/ && go vet ./...` 가 통과한다.

---

## Task 2: 카카오 장소 조회기

카카오 로컬 API를 실제로 부르는 부분이다. 바깥과 닿는 유일한 곳이므로 여기만 따로 떼어, 가짜 서버를 띄워 시험한다.

**Files:**
- Create: `api/internal/kakao/client.go`
- Test: `api/internal/kakao/client_test.go`

**Interfaces:**
- Consumes: 없음 (`cuisine`을 쓰지 않는다. 분류 문자열을 있는 그대로 넘긴다)
- Produces:
  - `type kakao.Place struct { ID, Name, CategoryName, RoadAddress, Phone, PlaceURL string; Lat, Lng float64; Distance int }`
  - `func kakao.NewClient(apiKey string) *Client`
  - `func kakao.NewClientWithBaseURL(apiKey, baseURL string, hc *http.Client) *Client` — 시험 전용
  - `func (c *Client) SearchRestaurants(ctx context.Context, lat, lng float64, radius int) ([]Place, error)`
  - `var kakao.ErrQuotaExceeded, kakao.ErrUpstream error`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`api/internal/kakao/client_test.go`:

```go
package kakao

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// pageJSON은 카카오 응답 한 페이지를 흉내 낸다.
// x는 경도, y는 위도이며 카카오는 이 값들을 문자열로 준다.
func pageJSON(count int, isEnd bool) string {
	docs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		docs = append(docs, fmt.Sprintf(`{
			"id": "%d",
			"place_name": "가게%d",
			"category_name": "음식점 > 한식 > 육류,고기",
			"phone": "02-000-0000",
			"address_name": "서울 강남구 역삼동 1",
			"road_address_name": "서울 강남구 테헤란로 %d",
			"place_url": "http://place.map.kakao.com/%d",
			"x": "127.02%02d",
			"y": "37.49%02d",
			"distance": "%d"
		}`, i, i, i, i, i, i, i*10)) 
	}
	return fmt.Sprintf(`{"documents": [%s], "meta": {"is_end": %t}}`,
		strings.Join(docs, ","), isEnd)
}

func TestSearchRestaurantsReadsAllThreePages(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, pageJSON(15, calls == 3))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 3 {
		t.Errorf("카카오를 %d번 불렀다. 3번이어야 한다", calls)
	}
	if len(places) != 45 {
		t.Errorf("%d곳을 받았다. 45곳이어야 한다", len(places))
	}
}

func TestSearchRestaurantsStopsWhenKakaoSaysItIsTheEnd(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		fmt.Fprint(w, pageJSON(3, true))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 1 {
		t.Errorf("카카오를 %d번 불렀다. 마지막 페이지라고 했으므로 1번이어야 한다", calls)
	}
	if len(places) != 3 {
		t.Errorf("%d곳을 받았다. 3곳이어야 한다", len(places))
	}
}

func TestSearchRestaurantsSendsCorrectRequest(t *testing.T) {
	var gotAuth, gotPath string
	var gotQuery map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		gotQuery = map[string]string{}
		for key := range r.URL.Query() {
			gotQuery[key] = r.URL.Query().Get(key)
		}
		fmt.Fprint(w, pageJSON(1, true))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	if _, err := client.SearchRestaurants(context.Background(), 37.5, 127.0, 800); err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}

	if gotAuth != "KakaoAK test-key" {
		t.Errorf("Authorization 헤더가 %q다. \"KakaoAK test-key\"여야 한다", gotAuth)
	}
	if gotPath != "/v2/local/search/category.json" {
		t.Errorf("경로가 %q다", gotPath)
	}
	want := map[string]string{
		"category_group_code": "FD6",
		"x":                   "127",
		"y":                   "37.5",
		"radius":              "800",
		"page":                "1",
		"size":                "15",
		"sort":                "distance",
	}
	for key, wantValue := range want {
		if gotQuery[key] != wantValue {
			t.Errorf("%s가 %q다. %q여야 한다", key, gotQuery[key], wantValue)
		}
	}
}

func TestSearchRestaurantsParsesFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [{
			"id": "26338954",
			"place_name": "연돈",
			"category_name": "음식점 > 일식 > 돈까스",
			"phone": "02-111-2222",
			"address_name": "서울 강남구 역삼동 1",
			"road_address_name": "서울 강남구 테헤란로 123",
			"place_url": "http://place.map.kakao.com/26338954",
			"x": "127.0281",
			"y": "37.4981",
			"distance": "120"
		}], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(places) != 1 {
		t.Fatalf("%d곳을 받았다. 1곳이어야 한다", len(places))
	}
	got := places[0]
	want := Place{
		ID:           "26338954",
		Name:         "연돈",
		CategoryName: "음식점 > 일식 > 돈까스",
		RoadAddress:  "서울 강남구 테헤란로 123",
		Phone:        "02-111-2222",
		PlaceURL:     "http://place.map.kakao.com/26338954",
		Lat:          37.4981,
		Lng:          127.0281,
		Distance:     120,
	}
	if got != want {
		t.Errorf("받은 값 %+v\n원하는 값 %+v", got, want)
	}
}

func TestSearchRestaurantsFallsBackToLotAddress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [{
			"id": "1", "place_name": "가게", "category_name": "음식점 > 분식",
			"address_name": "서울 강남구 역삼동 1", "road_address_name": "",
			"place_url": "", "x": "127.0", "y": "37.5", "distance": "10"
		}], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, _ := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if places[0].RoadAddress != "서울 강남구 역삼동 1" {
		t.Errorf("도로명 주소가 비었으면 지번 주소를 써야 한다. 받은 값 %q", places[0].RoadAddress)
	}
}

func TestSearchRestaurantsReportsQuotaExceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Errorf("한도 초과 오류여야 한다. 받은 오류: %v", err)
	}
}

func TestSearchRestaurantsReportsUpstreamFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("상위 서비스 오류여야 한다. 받은 오류: %v", err)
	}
}

func TestSearchRestaurantsReportsBrokenJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "이건 JSON이 아니다")
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("해석 실패도 상위 서비스 오류로 다뤄야 한다. 받은 오류: %v", err)
	}
}
```

- [ ] **Step 2: 시험이 실패하는지 확인한다**

```bash
cd api && go test ./internal/kakao/ -v
```

기대: 컴파일 실패. `undefined: NewClientWithBaseURL`, `undefined: Place` 등.

- [ ] **Step 3: 통과할 만큼만 구현한다**

`api/internal/kakao/client.go`:

```go
// Package kakao는 카카오 로컬 API와 이야기하는 유일한 창구다.
// 카카오는 응답 결과를 저장하는 것을 금지하므로, 여기서도 아무것도 저장하지 않는다.
package kakao

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	defaultBaseURL = "https://dapi.kakao.com"
	searchPath     = "/v2/local/search/category.json"
	// restaurantCode는 카카오가 음식점에 붙인 분류 코드다.
	restaurantCode = "FD6"
	// pageSize와 maxPages는 카카오가 정한 상한이다.
	// 한 번에 15개까지, 최대 3페이지까지만 준다. 따라서 최대 45곳이다.
	pageSize       = 15
	maxPages       = 3
	requestTimeout = 5 * time.Second
)

var (
	// ErrQuotaExceeded는 카카오 호출 한도를 다 썼을 때 나온다.
	ErrQuotaExceeded = errors.New("kakao: 호출 한도를 초과했습니다")
	// ErrUpstream은 카카오가 그 밖의 이유로 제대로 응답하지 못했을 때 나온다.
	ErrUpstream = errors.New("kakao: 장소 조회에 실패했습니다")
)

// Place 하나는 음식점 한 곳이다.
type Place struct {
	ID           string
	Name         string
	CategoryName string
	RoadAddress  string
	Phone        string
	PlaceURL     string
	Lat          float64
	Lng          float64
	Distance     int
}

// Client는 카카오 로컬 API를 부른다.
type Client struct {
	apiKey  string
	baseURL string
	http    *http.Client
}

// NewClient는 실제 카카오를 가리키는 조회기를 만든다.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:  apiKey,
		baseURL: defaultBaseURL,
		http:    &http.Client{Timeout: requestTimeout},
	}
}

// NewClientWithBaseURL은 시험에서 가짜 서버를 가리키게 할 때 쓴다.
func NewClientWithBaseURL(apiKey, baseURL string, hc *http.Client) *Client {
	return &Client{apiKey: apiKey, baseURL: baseURL, http: hc}
}

type document struct {
	ID           string `json:"id"`
	PlaceName    string `json:"place_name"`
	CategoryName string `json:"category_name"`
	Phone        string `json:"phone"`
	AddressName  string `json:"address_name"`
	RoadAddress  string `json:"road_address_name"`
	PlaceURL     string `json:"place_url"`
	X            string `json:"x"`
	Y            string `json:"y"`
	Distance     string `json:"distance"`
}

type searchResponse struct {
	Documents []document `json:"documents"`
	Meta      struct {
		IsEnd bool `json:"is_end"`
	} `json:"meta"`
}

// SearchRestaurants는 좌표 주변의 음식점을 가까운 순으로 돌려준다.
// 카카오가 한 번에 15곳씩 최대 3페이지만 주므로 최대 45곳이다.
func (c *Client) SearchRestaurants(ctx context.Context, lat, lng float64, radius int) ([]Place, error) {
	places := make([]Place, 0, pageSize*maxPages)
	for page := 1; page <= maxPages; page++ {
		parsed, err := c.fetchPage(ctx, lat, lng, radius, page)
		if err != nil {
			return nil, err
		}
		for _, doc := range parsed.Documents {
			places = append(places, toPlace(doc))
		}
		if parsed.Meta.IsEnd {
			break
		}
	}
	return places, nil
}

func (c *Client) fetchPage(ctx context.Context, lat, lng float64, radius, page int) (*searchResponse, error) {
	query := url.Values{}
	query.Set("category_group_code", restaurantCode)
	// 카카오는 x가 경도, y가 위도다. 순서를 바꾸면 엉뚱한 곳을 찾는다.
	query.Set("x", strconv.FormatFloat(lng, 'f', -1, 64))
	query.Set("y", strconv.FormatFloat(lat, 'f', -1, 64))
	query.Set("radius", strconv.Itoa(radius))
	query.Set("page", strconv.Itoa(page))
	query.Set("size", strconv.Itoa(pageSize))
	query.Set("sort", "distance")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+searchPath+"?"+query.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("%w: 요청을 만들지 못했습니다: %v", ErrUpstream, err)
	}
	req.Header.Set("Authorization", "KakaoAK "+c.apiKey)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusTooManyRequests {
		return nil, ErrQuotaExceeded
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: 응답 코드 %d", ErrUpstream, res.StatusCode)
	}

	var parsed searchResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("%w: 응답을 해석하지 못했습니다: %v", ErrUpstream, err)
	}
	return &parsed, nil
}

// toPlace는 카카오의 응답 한 건을 우리 형태로 옮긴다.
// 카카오는 좌표와 거리를 문자열로 주므로 여기서 숫자로 바꾼다.
// 숫자로 바꾸지 못하면 0으로 둔다 — 한 건의 좌표가 깨졌다고 조회 전체를 실패시키지 않는다.
func toPlace(doc document) Place {
	address := doc.RoadAddress
	if address == "" {
		address = doc.AddressName
	}
	lng, _ := strconv.ParseFloat(doc.X, 64)
	lat, _ := strconv.ParseFloat(doc.Y, 64)
	distance, _ := strconv.Atoi(doc.Distance)
	return Place{
		ID:           doc.ID,
		Name:         doc.PlaceName,
		CategoryName: doc.CategoryName,
		RoadAddress:  address,
		Phone:        doc.Phone,
		PlaceURL:     doc.PlaceURL,
		Lat:          lat,
		Lng:          lng,
		Distance:     distance,
	}
}
```

- [ ] **Step 4: 시험이 통과하는지 확인한다**

```bash
cd api && go test ./... -v && go vet ./...
```

기대: 모든 시험 PASS.

- [ ] **Step 5: 커밋한다**

```bash
git add api/internal/kakao/
git commit -m "feat(api): 카카오 로컬 API 조회기 추가"
```

**완료 확인:** `cd api && go test ./... && go vet ./...` 가 통과하고, 시험 로그에 실제 `dapi.kakao.com` 호출이 없다.

---

## Task 3: 조회 기능과 실행 진입점

Task 1과 2를 이어 붙여 화면이 부를 수 있는 기능 하나를 만들고, 서버를 켤 수 있게 한다. 이 Task가 끝나면 설계 문서 12절의 7번·8번 완료 조건이 충족된다.

**Files:**
- Create: `api/internal/httpapi/handler.go`
- Create: `api/cmd/server/main.go`
- Test: `api/internal/httpapi/handler_test.go`

**Interfaces:**
- Consumes: `cuisine.Extract`, `cuisine.CountByName`, `cuisine.Tally`, `kakao.Place`, `kakao.ErrQuotaExceeded`, `kakao.NewClient`
- Produces:
  - `type httpapi.PlaceFinder interface { SearchRestaurants(ctx context.Context, lat, lng float64, radius int) ([]kakao.Place, error) }`
  - `func httpapi.NewHandler(finder PlaceFinder) http.Handler` — `finder`가 nil이면 조회 요청에 `not_configured`로 답한다.

- [ ] **Step 1: 실패하는 시험을 쓴다**

`api/internal/httpapi/handler_test.go`:

```go
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

// fakeFinder는 카카오 대신 미리 정해 둔 답을 돌려준다.
type fakeFinder struct {
	places []kakao.Place
	err    error
	gotLat float64
	gotLng float64
	gotRad int
}

func (f *fakeFinder) SearchRestaurants(_ context.Context, lat, lng float64, radius int) ([]kakao.Place, error) {
	f.gotLat, f.gotLng, f.gotRad = lat, lng, radius
	return f.places, f.err
}

func get(t *testing.T, handler http.Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("응답을 해석하지 못했다: %v (본문: %s)", err, rec.Body.String())
	}
	return body
}

func TestNearbyReturnsCuisinesAndPlaces(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "먼집", CategoryName: "음식점 > 한식 > 육류,고기 > 곱창,막창", Distance: 300, Lat: 37.5, Lng: 127.0},
		{ID: "2", Name: "가까운집", CategoryName: "음식점 > 분식", Distance: 100, Lat: 37.5, Lng: 127.0},
		{ID: "3", Name: "고깃집둘", CategoryName: "음식점 > 한식 > 육류,고기 > 삼겹살", Distance: 200, Lat: 37.5, Lng: 127.0},
	}}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0")

	if rec.Code != http.StatusOK {
		t.Fatalf("응답 코드가 %d다. 200이어야 한다 (본문: %s)", rec.Code, rec.Body.String())
	}

	var body struct {
		Cuisines []struct {
			Name  string `json:"name"`
			Count int    `json:"count"`
		} `json:"cuisines"`
		Places []struct {
			ID       string `json:"id"`
			Cuisine  string `json:"cuisine"`
			Distance int    `json:"distance"`
		} `json:"places"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("응답을 해석하지 못했다: %v", err)
	}

	if len(body.Cuisines) != 2 {
		t.Fatalf("음식 종류가 %d개다. 2개여야 한다: %+v", len(body.Cuisines), body.Cuisines)
	}
	if body.Cuisines[0].Name != "한식 > 육류,고기" || body.Cuisines[0].Count != 2 {
		t.Errorf("첫 종류가 %+v다. 개수가 많은 \"한식 > 육류,고기\" 2개가 먼저여야 한다", body.Cuisines[0])
	}
	if len(body.Places) != 3 {
		t.Fatalf("가게가 %d곳이다. 3곳이어야 한다", len(body.Places))
	}
	if body.Places[0].ID != "2" {
		t.Errorf("첫 가게가 %q다. 가장 가까운 \"2\"여야 한다", body.Places[0].ID)
	}
	if body.Places[0].Cuisine != "분식" {
		t.Errorf("첫 가게의 음식 종류가 %q다. \"분식\"이어야 한다", body.Places[0].Cuisine)
	}
}

func TestNearbyPassesRadiusToFinder(t *testing.T) {
	finder := &fakeFinder{}
	get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0&radius=1500")
	if finder.gotRad != 1500 {
		t.Errorf("반경 %d를 넘겼다. 1500이어야 한다", finder.gotRad)
	}
}

func TestNearbyUsesDefaultRadius(t *testing.T) {
	finder := &fakeFinder{}
	get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0")
	if finder.gotRad != 500 {
		t.Errorf("반경 %d를 넘겼다. 기본값 500이어야 한다", finder.gotRad)
	}
}

func TestNearbyDropsPlacesWithoutCuisine(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "분류없음", CategoryName: "음식점", Distance: 10},
		{ID: "2", Name: "분식집", CategoryName: "음식점 > 분식", Distance: 20},
	}}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0")

	var body struct {
		Places []struct {
			ID string `json:"id"`
		} `json:"places"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Places) != 1 || body.Places[0].ID != "2" {
		t.Errorf("음식 종류를 만들 수 없는 가게는 빼야 한다. 받은 값: %+v", body.Places)
	}
}

func TestNearbyReturnsEmptyArraysNotNull(t *testing.T) {
	rec := get(t, NewHandler(&fakeFinder{}), "/api/v1/nearby?lat=37.5&lng=127.0")
	got := rec.Body.String()
	if got != `{"cuisines":[],"places":[]}`+"\n" {
		t.Errorf("빈 결과는 null이 아니라 []여야 한다. 받은 본문: %s", got)
	}
}

func TestNearbyRejectsBadInput(t *testing.T) {
	tests := []struct {
		name      string
		target    string
		wantCode  int
		wantError string
	}{
		{"위도가 없다", "/api/v1/nearby?lng=127.0", http.StatusBadRequest, "invalid_coordinates"},
		{"경도가 없다", "/api/v1/nearby?lat=37.5", http.StatusBadRequest, "invalid_coordinates"},
		{"위도가 범위를 벗어난다", "/api/v1/nearby?lat=999&lng=127.0", http.StatusBadRequest, "invalid_coordinates"},
		{"경도가 범위를 벗어난다", "/api/v1/nearby?lat=37.5&lng=999", http.StatusBadRequest, "invalid_coordinates"},
		{"위도가 숫자가 아니다", "/api/v1/nearby?lat=서울&lng=127.0", http.StatusBadRequest, "invalid_coordinates"},
		{"위도가 NaN이다", "/api/v1/nearby?lat=nan&lng=127.0", http.StatusBadRequest, "invalid_coordinates"},
		{"경도가 NaN이다", "/api/v1/nearby?lat=37.5&lng=NaN", http.StatusBadRequest, "invalid_coordinates"},
		{"위도가 무한대다", "/api/v1/nearby?lat=inf&lng=127.0", http.StatusBadRequest, "invalid_coordinates"},
		{"경도가 음의 무한대다", "/api/v1/nearby?lat=37.5&lng=-Inf", http.StatusBadRequest, "invalid_coordinates"},
		{"반경이 너무 작다", "/api/v1/nearby?lat=37.5&lng=127.0&radius=10", http.StatusBadRequest, "invalid_radius"},
		{"반경이 너무 크다", "/api/v1/nearby?lat=37.5&lng=127.0&radius=30000", http.StatusBadRequest, "invalid_radius"},
		{"반경이 숫자가 아니다", "/api/v1/nearby?lat=37.5&lng=127.0&radius=넓게", http.StatusBadRequest, "invalid_radius"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := get(t, NewHandler(&fakeFinder{}), tt.target)
			if rec.Code != tt.wantCode {
				t.Errorf("응답 코드가 %d다. %d여야 한다", rec.Code, tt.wantCode)
			}
			if got := decodeError(t, rec)["error"]; got != tt.wantError {
				t.Errorf("오류 코드가 %q다. %q여야 한다", got, tt.wantError)
			}
		})
	}
}

func TestNearbyWithoutFinderSaysNotConfigured(t *testing.T) {
	rec := get(t, NewHandler(nil), "/api/v1/nearby?lat=37.5&lng=127.0")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("응답 코드가 %d다. 500이어야 한다", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "not_configured" {
		t.Errorf("오류 코드가 %q다. \"not_configured\"여야 한다", got)
	}
}

func TestNearbyRejectsBadInputEvenWithoutFinder(t *testing.T) {
	// 잘못된 요청은 호출자의 잘못이므로, 서버에 열쇠가 있든 없든 400으로 답해야 한다.
	// 이 시험은 검사 순서를 고정한다 — nil 검사가 앞으로 오면 여기서 500이 나와 실패한다.
	rec := get(t, NewHandler(nil), "/api/v1/nearby?lat=999&lng=127.0")
	if rec.Code != http.StatusBadRequest {
		t.Errorf("응답 코드가 %d다. 400이어야 한다", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "invalid_coordinates" {
		t.Errorf("오류 코드가 %q다. \"invalid_coordinates\"여야 한다", got)
	}
}

func TestNearbyMapsQuotaExceeded(t *testing.T) {
	rec := get(t, NewHandler(&fakeFinder{err: kakao.ErrQuotaExceeded}), "/api/v1/nearby?lat=37.5&lng=127.0")
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("응답 코드가 %d다. 429여야 한다", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "quota_exceeded" {
		t.Errorf("오류 코드가 %q다. \"quota_exceeded\"여야 한다", got)
	}
}

func TestNearbyMapsUpstreamFailure(t *testing.T) {
	rec := get(t, NewHandler(&fakeFinder{err: kakao.ErrUpstream}), "/api/v1/nearby?lat=37.5&lng=127.0")
	if rec.Code != http.StatusBadGateway {
		t.Errorf("응답 코드가 %d다. 502여야 한다", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "upstream_error" {
		t.Errorf("오류 코드가 %q다. \"upstream_error\"여야 한다", got)
	}
}

func TestHealthz(t *testing.T) {
	rec := get(t, NewHandler(nil), "/healthz")
	if rec.Code != http.StatusOK {
		t.Errorf("응답 코드가 %d다. 200이어야 한다", rec.Code)
	}
}
```

- [ ] **Step 2: 시험이 실패하는지 확인한다**

```bash
cd api && go test ./internal/httpapi/ -v
```

기대: 컴파일 실패. `undefined: NewHandler`.

- [ ] **Step 3: 통과할 만큼만 구현한다**

`api/internal/httpapi/handler.go`:

```go
// Package httpapi는 화면이 부를 수 있는 기능을 제공한다.
// 값 검사와 응답 형태 만들기만 하고, 아무것도 저장하지 않는다.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/VeritasForge/random-choice/api/internal/cuisine"
	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

const (
	defaultRadius = 500
	minRadius     = 100
	maxRadius     = 20000
)

// PlaceFinder는 주변 음식점을 찾아 주는 무언가다.
// 실제로는 카카오 조회기가, 시험에서는 가짜가 들어간다.
type PlaceFinder interface {
	SearchRestaurants(ctx context.Context, lat, lng float64, radius int) ([]kakao.Place, error)
}

type cuisineDTO struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type placeDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Cuisine     string  `json:"cuisine"`
	Distance    int     `json:"distance"`
	RoadAddress string  `json:"roadAddress"`
	Phone       string  `json:"phone"`
	PlaceURL    string  `json:"placeUrl"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
}

type nearbyResponse struct {
	Cuisines []cuisineDTO `json:"cuisines"`
	Places   []placeDTO   `json:"places"`
}

type errorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// NewHandler는 서비스가 제공하는 모든 경로를 담은 처리기를 만든다.
// finder가 nil이면 카카오 열쇠가 설정되지 않은 상태로 보고 not_configured로 답한다.
// 열쇠가 없다고 서버가 아예 뜨지 않으면 무엇이 잘못됐는지 알기 어렵기 때문이다.
func NewHandler(finder PlaceFinder) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/nearby", func(w http.ResponseWriter, r *http.Request) {
		handleNearby(w, r, finder)
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

func handleNearby(w http.ResponseWriter, r *http.Request, finder PlaceFinder) {
	// 요청 값 검사를 먼저 한다. 잘못된 요청은 서버에 열쇠가 있든 없든
	// 호출자의 잘못이므로 400으로 답해야 한다. 열쇠가 없다는 이유로 500을
	// 돌려주면 책임을 잘못 돌리게 되고, 설계 문서 12절의 완료 조건 두 개
	// (열쇠 없이 not_configured 확인, 열쇠 없이 invalid_coordinates 확인)가
	// 동시에 성립하지 못한다.
	lat, lng, ok := parseCoordinates(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_coordinates",
			"위도·경도 값이 올바르지 않습니다.")
		return
	}

	radius, ok := parseRadius(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_radius",
			"반경은 100m 이상 20000m 이하여야 합니다.")
		return
	}

	if finder == nil {
		writeError(w, http.StatusInternalServerError, "not_configured",
			"서버에 카카오 열쇠가 설정되지 않았습니다.")
		return
	}

	found, err := finder.SearchRestaurants(r.Context(), lat, lng, radius)
	if err != nil {
		if errors.Is(err, kakao.ErrQuotaExceeded) {
			writeError(w, http.StatusTooManyRequests, "quota_exceeded",
				"오늘 조회 한도를 다 썼습니다. 내일 다시 이용해 주세요.")
			return
		}
		slog.Error("주변 음식점 조회에 실패했습니다", "error", err)
		writeError(w, http.StatusBadGateway, "upstream_error",
			"장소 정보를 가져오지 못했습니다.")
		return
	}

	writeJSON(w, http.StatusOK, buildResponse(found))
}

// parseCoordinates는 위도·경도를 읽는다. 하나라도 올바르지 않으면 false를 돌려준다.
// NaN을 따로 걸러내는 이유: strconv.ParseFloat는 "nan"을 오류 없이 받아들이는데,
// NaN은 어떤 비교에서도 false라서 범위 검사(-90..90)를 그냥 통과해 버린다.
// 반대로 "inf"는 90보다 크다고 판정되어 범위 검사에 이미 걸리므로 따로 볼 필요가 없다.
func parseCoordinates(r *http.Request) (float64, float64, bool) {
	query := r.URL.Query()
	lat, err := strconv.ParseFloat(query.Get("lat"), 64)
	if err != nil || math.IsNaN(lat) || lat < -90 || lat > 90 {
		return 0, 0, false
	}
	lng, err := strconv.ParseFloat(query.Get("lng"), 64)
	if err != nil || math.IsNaN(lng) || lng < -180 || lng > 180 {
		return 0, 0, false
	}
	return lat, lng, true
}

// parseRadius는 반경을 읽는다. 없으면 기본값을 쓰고, 있는데 범위를 벗어나면 false를 돌려준다.
func parseRadius(r *http.Request) (int, bool) {
	raw := r.URL.Query().Get("radius")
	if raw == "" {
		return defaultRadius, true
	}
	radius, err := strconv.Atoi(raw)
	if err != nil || radius < minRadius || radius > maxRadius {
		return 0, false
	}
	return radius, true
}

// buildResponse는 조회 결과를 화면이 쓰기 좋은 형태로 옮긴다.
// 음식 종류를 만들 수 없는 가게는 뺀다. 화면이 종류로 걸러 내기 때문에
// 종류가 없는 가게는 어느 화면에도 나타나지 못한다.
func buildResponse(found []kakao.Place) nearbyResponse {
	places := make([]placeDTO, 0, len(found))
	names := make([]string, 0, len(found))

	for _, place := range found {
		name := cuisine.Extract(place.CategoryName)
		if name == "" {
			continue
		}
		names = append(names, name)
		places = append(places, placeDTO{
			ID:          place.ID,
			Name:        place.Name,
			Cuisine:     name,
			Distance:    place.Distance,
			RoadAddress: place.RoadAddress,
			Phone:       place.Phone,
			PlaceURL:    place.PlaceURL,
			Lat:         place.Lat,
			Lng:         place.Lng,
		})
	}

	sort.SliceStable(places, func(i, j int) bool {
		return places[i].Distance < places[j].Distance
	})

	tallies := cuisine.CountByName(names)
	cuisines := make([]cuisineDTO, 0, len(tallies))
	for _, tally := range tallies {
		cuisines = append(cuisines, cuisineDTO{Name: tally.Name, Count: tally.Count})
	}

	return nearbyResponse{Cuisines: cuisines, Places: places}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("응답을 쓰지 못했습니다", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: code, Message: message})
}
```

- [ ] **Step 4: 시험이 통과하는지 확인한다**

```bash
cd api && go test ./... -v && go vet ./...
```

기대: 모든 시험 PASS.

- [ ] **Step 5: 실행 진입점을 만든다**

`api/cmd/server/main.go`:

```go
// 서버를 켜는 진입점이다.
// 카카오 열쇠는 환경변수 KAKAO_REST_API_KEY로만 읽는다.
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/httpapi"
	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 열쇠가 없으면 조회기를 만들지 않는다. 그러면 조회 요청은 not_configured로 답한다.
	// 서버 자체는 정상적으로 떠서, 무엇이 빠졌는지 응답으로 알 수 있다.
	var finder httpapi.PlaceFinder
	if key := os.Getenv("KAKAO_REST_API_KEY"); key != "" {
		finder = kakao.NewClient(key)
	} else {
		slog.Warn("KAKAO_REST_API_KEY가 없습니다. 조회 요청은 not_configured로 응답합니다")
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.NewHandler(finder),
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("서버를 시작합니다", "addr", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("서버가 멈췄습니다", "error", err)
		os.Exit(1)
	}
}
```

- [ ] **Step 6: 서버를 실제로 켜서 확인한다**

```bash
cd api && go build -o /tmp/rc-server ./cmd/server && (/tmp/rc-server &) && sleep 1
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/healthz"
curl -s -w "\n%{http_code}\n" "http://localhost:8080/api/v1/nearby?lat=37.5&lng=127.0"
curl -s -w "\n%{http_code}\n" "http://localhost:8080/api/v1/nearby?lat=999&lng=127.0"
pkill -f /tmp/rc-server
```

포트 8080이 다른 프로그램에 쓰이고 있으면 `PORT=8090 /tmp/rc-server` 처럼 바꿔 띄우고
curl 주소의 포트도 함께 바꾼다. (이 기기에서는 실제로 8080이 점유되어 있었다)

기대:
- `/healthz` → `200`
- 열쇠 없이 조회 → `{"error":"not_configured",...}` 와 `500`
- 잘못된 위도 → `{"error":"invalid_coordinates",...}` 와 `400`

- [ ] **Step 7: 커밋한다**

```bash
git add api/internal/httpapi/ api/cmd/
git commit -m "feat(api): 주변 음식점 조회 기능과 서버 실행 진입점 추가"
```

**완료 확인:** `cd api && go build ./... && go test ./... && go vet ./...` 가 통과하고, Step 6의 세 가지 응답이 기대와 같다.

---

## Task 4: 화면 뼈대와 무작위 추첨 규칙

Next.js 프로젝트를 만들고, 무작위 추첨 규칙을 먼저 순수 함수로 만든다. 화면 그리기는 다음 Task에서 한다.

**Files:**
- Create: `web/` 전체 (도구가 생성)
- Modify: `web/next.config.ts`, `web/package.json`
- Create: `web/vitest.config.mts`
- Create: `web/lib/pick.ts`
- Test: `web/lib/pick.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type Rng = () => number` — 0 이상 1 미만의 수를 돌려주는 함수
  - `function pickDistinct<T>(items: readonly T[], count: number, rng: Rng): T[]`
  - `function pickAvoiding<T>(items: readonly T[], count: number, avoid: readonly T[], rng: Rng): T[]`
  - `function pickOne<T>(items: readonly T[], rng: Rng): T | undefined`

- [ ] **Step 1: Next.js 프로젝트를 만든다**

```bash
npx --yes create-next-app@latest web --ts --app --no-src-dir --tailwind --eslint --import-alias "@/*" --use-npm --turbopack --yes
rm -rf web/.git web/CLAUDE.md web/AGENTS.md
```

`web/.git`을 지우는 이유는 저장소 안에 저장소가 생기면 상위 저장소가 `web/`을 통째로 무시하기 때문이다. `CLAUDE.md`·`AGENTS.md`는 도구가 끼워 넣은 안내문이라 이 프로젝트의 규칙과 섞이면 혼란스러워 지운다.

- [ ] **Step 2: 시험 도구를 설치하고 스크립트를 넣는다**

```bash
cd web && npm install --save-dev vitest@^4 && cd ..
```

`web/vitest.config.mts` 생성 (확장자가 `.ts`가 아니라 `.mts`인 이유: `package.json`에
`"type": "module"`이 없어 Node가 `.ts` 설정 파일을 CommonJS로 읽는데 내용은 ESM이라
실행할 때마다 경고가 뜬다. `.mts`는 확장자만으로 ESM임이 확정되고, Next가 만든
`tsconfig.json`의 `include`에 이미 `**/*.mts`가 들어 있어 타입 검사도 그대로 걸린다):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib 아래의 함수들은 브라우저 없이 도는 순수 계산이라 node로 충분하다.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

`web/package.json`의 `scripts`에 `test`를 추가한다. 추가 후 `scripts`는 다음과 같아야 한다:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 3: 브라우저 요청을 Go 서버로 넘기도록 설정한다**

`web/next.config.ts` 전체를 다음으로 바꾼다:

```ts
import type { NextConfig } from "next";

// 브라우저는 자기 주소의 /api로만 요청하고, Next.js가 그 요청을 Go 서버로 넘긴다.
// 이렇게 하면 브라우저 입장에서 같은 출처라 교차 출처 허용 설정이 필요 없다.
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 4: 실패하는 시험을 쓴다**

`web/lib/pick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickAvoiding, pickDistinct, pickOne, type Rng } from "./pick";

/** 정해진 값을 차례로 돌려주는 가짜 난수 생성기. 값이 떨어지면 처음으로 돌아간다. */
function fixed(...values: number[]): Rng {
  let index = 0;
  return () => values[index++ % values.length];
}

/** 언제나 0을 돌려주는 난수 생성기. 섞기가 일어나지 않아 원래 순서가 그대로 나온다. */
const zero: Rng = () => 0;

describe("pickDistinct", () => {
  it("요청한 개수만큼 고른다", () => {
    expect(pickDistinct(["a", "b", "c", "d", "e"], 4, zero)).toEqual(["a", "b", "c", "d"]);
  });

  it("목록이 요청한 개수보다 적으면 있는 만큼만 고른다", () => {
    expect(pickDistinct(["a", "b"], 4, zero)).toEqual(["a", "b"]);
  });

  it("같은 항목을 두 번 고르지 않는다", () => {
    const got = pickDistinct(["a", "b", "c", "d", "e"], 4, fixed(0.99));
    expect(new Set(got).size).toBe(4);
  });

  it("원본 목록을 바꾸지 않는다", () => {
    const items = ["a", "b", "c"];
    pickDistinct(items, 2, fixed(0.9));
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("빈 목록이면 빈 결과", () => {
    expect(pickDistinct([], 4, zero)).toEqual([]);
  });

  it("0개를 요청하면 빈 결과", () => {
    expect(pickDistinct(["a", "b"], 0, zero)).toEqual([]);
  });
});

describe("pickAvoiding", () => {
  it("직전 후보를 뺀 나머지로 채울 수 있으면 겹치지 않게 고른다", () => {
    const got = pickAvoiding(["a", "b", "c", "d", "e", "f"], 4, ["a", "b"], zero);
    expect(got).toEqual(["c", "d", "e", "f"]);
  });

  it("남은 것이 모자라면 직전 후보를 다시 써서라도 개수를 채운다", () => {
    const got = pickAvoiding(["a", "b", "c"], 3, ["a", "b", "c"], zero);
    expect(got).toHaveLength(3);
    expect(new Set(got).size).toBe(3);
  });

  it("겹침을 허용해도 같은 항목을 두 번 넣지 않는다", () => {
    const got = pickAvoiding(["a", "b", "c", "d"], 3, ["a", "b", "c"], zero);
    expect(new Set(got).size).toBe(3);
  });
});

describe("pickOne", () => {
  it("난수에 해당하는 항목을 고른다", () => {
    expect(pickOne(["a", "b", "c"], fixed(0.5))).toBe("b");
  });

  it("빈 목록이면 아무것도 고르지 못한다", () => {
    expect(pickOne([], zero)).toBeUndefined();
  });
});
```

- [ ] **Step 5: 시험이 실패하는지 확인한다**

```bash
cd web && npm test
```

기대: `Failed to resolve import "./pick"` 또는 그와 같은 뜻의 실패.

- [ ] **Step 6: 통과할 만큼만 구현한다**

`web/lib/pick.ts`:

```ts
/** 0 이상 1 미만의 수를 돌려주는 함수. 시험에서는 정해진 값을 주는 가짜를 넣는다. */
export type Rng = () => number;

/**
 * 목록에서 중복 없이 최대 count개를 무작위로 고른다.
 * 목록이 count개보다 적으면 있는 만큼만 돌려준다.
 * 원본 목록은 건드리지 않는다.
 *
 * 항목마다 뽑힐 확률이 같다. 가게 수가 많은 종류를 더 잘 뽑히게 하면
 * 흔한 한식만 계속 나와서 이 서비스의 쓸모가 사라진다.
 */
export function pickDistinct<T>(items: readonly T[], count: number, rng: Rng): T[] {
  const pool = [...items];
  const take = Math.min(count, pool.length);
  const picked: T[] = [];

  // 앞에서부터 필요한 개수만큼만 자리를 확정하는 방식(부분 피셔-예이츠 섞기).
  for (let i = 0; i < take; i += 1) {
    const target = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[target]] = [pool[target], pool[i]];
    picked.push(pool[i]);
  }
  return picked;
}

/**
 * 직전 후보(avoid)와 최대한 겹치지 않게 count개를 고른다.
 * 겹치지 않는 것만으로 개수를 채울 수 없으면 직전 후보에서 마저 채운다.
 * "다시 뽑기"를 눌렀는데 같은 것만 나오면 다시 뽑은 의미가 없기 때문이다.
 */
export function pickAvoiding<T>(
  items: readonly T[],
  count: number,
  avoid: readonly T[],
  rng: Rng,
): T[] {
  const avoided = new Set(avoid);
  const fresh = items.filter((item) => !avoided.has(item));

  if (fresh.length >= count) {
    return pickDistinct(fresh, count, rng);
  }

  const reusable = items.filter((item) => avoided.has(item));
  return [
    ...pickDistinct(fresh, fresh.length, rng),
    ...pickDistinct(reusable, count - fresh.length, rng),
  ];
}

/** 목록에서 하나를 무작위로 고른다. 목록이 비어 있으면 아무것도 돌려주지 않는다. */
export function pickOne<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[Math.floor(rng() * items.length)];
}
```

- [ ] **Step 7: 시험이 통과하는지 확인한다**

```bash
cd web && npm test && npx tsc --noEmit && npm run build
```

기대: 시험 전부 PASS, 타입 오류 없음, 빌드 성공.

- [ ] **Step 8: 커밋한다**

```bash
git add web/ .gitignore
git commit -m "feat(web): Next.js 프로젝트와 무작위 추첨 규칙 추가"
```

**완료 확인:** `cd web && npm test && npx tsc --noEmit && npm run build` 가 모두 통과한다.

---

## Task 5: 서버와 이야기하는 부분

화면이 Go 서버와 브라우저 위치 기능을 쓰는 통로를 만든다. 화면 그리기와 분리해 두면 이 부분만 따로 시험할 수 있다.

**Files:**
- Create: `web/lib/api.ts`
- Create: `web/lib/geo.ts`
- Test: `web/lib/api.test.ts`

**Interfaces:**
- Consumes: Task 3의 응답 형태 (`{cuisines, places}` 및 오류 `{error, message}`)
- Produces:
  - `type Cuisine = { name: string; count: number }`
  - `type Place = { id, name, cuisine, distance, roadAddress, phone, placeUrl, lat, lng }`
  - `type NearbyResult = { cuisines: Cuisine[]; places: Place[] }`
  - `class NearbyError extends Error { readonly code: string }`
  - `function fetchNearby(lat: number, lng: number, radius: number): Promise<NearbyResult>`
  - `type Coords = { lat: number; lng: number }`
  - `function getCurrentPosition(): Promise<Coords>` — 실패 시 `Error`의 `message`가 `permission_denied` · `position_unavailable` · `unsupported` 중 하나

- [ ] **Step 1: 실패하는 시험을 쓴다**

`web/lib/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNearby, NearbyError } from "./api";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchNearby", () => {
  it("성공하면 결과를 그대로 돌려준다", async () => {
    const payload = {
      cuisines: [{ name: "분식", count: 2 }],
      places: [
        {
          id: "1",
          name: "김밥집",
          cuisine: "분식",
          distance: 100,
          roadAddress: "서울 강남구 테헤란로 1",
          phone: "02-000-0000",
          placeUrl: "http://place.map.kakao.com/1",
          lat: 37.5,
          lng: 127.0,
        },
      ],
    };
    respondWith(200, payload);
    await expect(fetchNearby(37.5, 127.0, 500)).resolves.toEqual(payload);
  });

  it("요청 주소에 위도·경도·반경을 담는다", async () => {
    respondWith(200, { cuisines: [], places: [] });
    await fetchNearby(37.5, 127.0, 800);
    expect(fetch).toHaveBeenCalledWith("/api/v1/nearby?lat=37.5&lng=127&radius=800");
  });

  it("서버가 오류를 주면 코드를 담아 던진다", async () => {
    respondWith(429, { error: "quota_exceeded", message: "오늘 조회 한도를 다 썼습니다." });
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "quota_exceeded",
      message: "오늘 조회 한도를 다 썼습니다.",
    });
  });

  it("오류 본문을 해석할 수 없어도 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("서버 오류", { status: 500 })),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toBeInstanceOf(NearbyError);
  });

  it("서버에 닿지 못하면 network_error로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("failed to fetch");
      }),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "network_error",
    });
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 확인한다**

```bash
cd web && npm test
```

기대: `Failed to resolve import "./api"`.

- [ ] **Step 3: 통과할 만큼만 구현한다**

`web/lib/api.ts`:

```ts
export type Cuisine = { name: string; count: number };

export type Place = {
  id: string;
  name: string;
  cuisine: string;
  distance: number;
  roadAddress: string;
  phone: string;
  placeUrl: string;
  lat: number;
  lng: number;
};

export type NearbyResult = { cuisines: Cuisine[]; places: Place[] };

/**
 * 서버가 돌려준 오류를 코드와 함께 전달한다.
 * 화면은 code를 보고 어떤 안내 문구를 보여줄지 정한다.
 */
export class NearbyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NearbyError";
    this.code = code;
  }
}

/** 주변 음식점과 음식 종류를 서버에 물어본다. */
export async function fetchNearby(
  lat: number,
  lng: number,
  radius: number,
): Promise<NearbyResult> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  } catch {
    throw new NearbyError("network_error", "서버에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = body as { error?: unknown; message?: unknown } | null;
    const code = typeof parsed?.error === "string" ? parsed.error : "unknown_error";
    const message =
      typeof parsed?.message === "string"
        ? parsed.message
        : "알 수 없는 오류가 발생했습니다.";
    throw new NearbyError(code, message);
  }

  return (await response.json()) as NearbyResult;
}
```

`web/lib/geo.ts`:

```ts
export type Coords = { lat: number; lng: number };

/**
 * 브라우저에게 현재 위치를 묻는다.
 * 실패하면 Error를 던지고, message에 이유를 담는다:
 * unsupported(위치 기능 자체가 없음) · permission_denied(사용자가 거부) ·
 * position_unavailable(그 밖의 실패). 화면은 이 값으로 안내 문구를 고른다.
 */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "permission_denied"
              : "position_unavailable",
          ),
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  });
}
```

- [ ] **Step 4: 시험이 통과하는지 확인한다**

```bash
cd web && npm test && npx tsc --noEmit
```

기대: 시험 전부 PASS, 타입 오류 없음.

- [ ] **Step 5: 커밋한다**

```bash
git add web/lib/
git commit -m "feat(web): 서버 조회와 위치 확인 통로 추가"
```

**완료 확인:** `cd web && npm test && npx tsc --noEmit` 가 통과한다.

---

## Task 6: 세 화면 만들고 연결하기

시작 → 후보 고르기 → 결과로 이어지는 실제 화면을 만든다.

**Files:**
- Create: `web/components/StartScreen.tsx`
- Create: `web/components/CandidateScreen.tsx`
- Create: `web/components/ResultScreen.tsx`
- Create: `web/components/Notice.tsx`
- Modify: `web/app/page.tsx` (도구가 만든 예제 화면을 통째로 바꾼다)
- Modify: `web/app/layout.tsx` (제목과 언어 설정만)

**Interfaces:**
- Consumes: Task 4의 `pickDistinct`·`pickAvoiding`·`pickOne`, Task 5의 `fetchNearby`·`NearbyError`·`getCurrentPosition`·`NearbyResult`·`Place`
- Produces: 없음 (마지막 Task)

- [ ] **Step 1: 안내 화면 조각을 만든다**

`web/components/Notice.tsx`:

```tsx
type Action = { label: string; onClick: () => void };

type Props = {
  title: string;
  description: string;
  actions: Action[];
};

/** 오류나 빈 결과를 알리고, 다음에 할 수 있는 일을 버튼으로 보여준다. */
export default function Notice({ title, description, actions }: Props) {
  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-neutral-500">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 시작 화면을 만든다**

`web/components/StartScreen.tsx`:

```tsx
type Props = {
  onStart: () => void;
  loading: boolean;
};

export default function StartScreen({ onStart, loading }: Props) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        오늘 점심,
        <br />
        제가 정해 드릴게요
      </h1>
      <p className="max-w-xs text-sm leading-relaxed text-neutral-500">
        주변에 있는 음식점을 보고 <strong className="font-semibold">무엇을 먹을지</strong>부터
        좁혀 드립니다. 후보를 직접 적지 않아도 됩니다.
      </p>
      {/*
        disabled 대신 aria-disabled를 쓰는 이유: 방금 누른 버튼을 disabled로 만들면
        브라우저가 그 버튼의 포커스를 떨어뜨린다. 키보드나 화면 낭독기를 쓰는 사람은
        자기 위치를 잃고, 무슨 일이 시작됐는지도 듣지 못한다. 하필 위치 확인과
        네트워크 왕복으로 이 앱에서 가장 오래 걸리는 순간이다.
        aria-disabled는 "지금은 누를 수 없음"만 알리고 포커스는 그대로 둔다.
        실제로 눌리지 않게 막는 것은 아래 onClick이 맡는다.
      */}
      <button
        type="button"
        onClick={loading ? undefined : onStart}
        aria-disabled={loading}
        aria-busy={loading}
        className={`rounded-full bg-neutral-900 px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-neutral-900 ${
          loading ? "opacity-50" : ""
        }`}
      >
        {loading ? "주변을 살펴보는 중…" : "위치 허용하고 시작하기"}
      </button>
      {/*
        눈에는 보이지 않고 화면 낭독기만 읽는 영역. 로딩이 "시작되는 것"을 소리로 알린다.
        버튼 글자만 바꾸면 포커스가 그 버튼에 없는 사람은 알 수 없기 때문이다.
        끝나는 것은 여기서 알리지 않는다 — 내용이 빈 문자열로 돌아가는 변화를
        낭독기는 읽지 않고, 로딩이 끝나면 대개 이 화면 자체가 사라진다.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading ? "주변 음식점을 찾고 있습니다." : ""}
      </p>
    </section>
  );
}
```

- [ ] **Step 3: 후보 화면을 만든다**

`web/components/CandidateScreen.tsx`:

```tsx
type Props = {
  candidates: string[];
  onChoose: (cuisine: string) => void;
  onReshuffle: () => void;
  onDecideForMe: () => void;
};

export default function CandidateScreen({
  candidates,
  onChoose,
  onReshuffle,
  onDecideForMe,
}: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <h2 className="text-2xl font-bold tracking-tight">어느 쪽이 끌리나요?</h2>

      <div className="grid w-full grid-cols-2 gap-3">
        {candidates.map((cuisine) => (
          <button
            key={cuisine}
            type="button"
            onClick={() => onChoose(cuisine)}
            className="flex min-h-28 items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 text-center text-base font-semibold break-keep transition hover:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-white"
          >
            {cuisine}
          </button>
        ))}
      </div>

      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onReshuffle}
          className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          다시 뽑기
        </button>
        <button
          type="button"
          onClick={onDecideForMe}
          className="rounded-full bg-neutral-900 px-6 py-3.5 text-base font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          못 고르겠어요, 정해 주세요
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 결과 화면을 만든다**

`web/components/ResultScreen.tsx`:

```tsx
import type { Place } from "@/lib/api";

type Props = {
  cuisine: string;
  places: Place[];
  onRestart: () => void;
};

export default function ResultScreen({ cuisine, places, onRestart }: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-neutral-500">오늘은</p>
        <h2 className="text-3xl font-bold tracking-tight break-keep">{cuisine}</h2>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {places.map((place) => (
          <li key={place.id}>
            <a
              href={place.placeUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4 transition hover:border-neutral-900 dark:border-neutral-800 dark:hover:border-white"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{place.name}</span>
                <span className="truncate text-xs text-neutral-500">
                  {place.roadAddress}
                </span>
              </span>
              <span className="shrink-0 text-sm text-neutral-500">{place.distance}m</span>
            </a>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onRestart}
        className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        처음부터 다시
      </button>
    </section>
  );
}
```

- [ ] **Step 5: 세 화면을 연결한다**

`web/app/page.tsx` 전체를 다음으로 바꾼다:

```tsx
"use client";

import { useState } from "react";
import CandidateScreen from "@/components/CandidateScreen";
import Notice from "@/components/Notice";
import ResultScreen from "@/components/ResultScreen";
import StartScreen from "@/components/StartScreen";
import { fetchNearby, NearbyError, type NearbyResult } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { pickAvoiding, pickDistinct, pickOne } from "@/lib/pick";

const CANDIDATE_COUNT = 4;
const DEFAULT_RADIUS = 500;
const WIDER_RADII = [1000, 2000];

/**
 * 지금 무엇을 보여줄지를 하나의 값으로 관리한다.
 * 결과와 후보를 이 값 안에 함께 담아 두어, 화면 상태와 데이터가 어긋나지 않게 한다.
 * 여기 담긴 목록은 새로고침하면 사라진다. 어디에도 저장하지 않는다 —
 * 카카오가 결과 저장을 금지하기 때문이다.
 */
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "candidates"; result: NearbyResult; candidates: string[] }
  | { kind: "result"; result: NearbyResult; cuisine: string }
  | { kind: "empty"; radius: number }
  | { kind: "error"; code: string; message: string };

const ERROR_TEXT: Record<string, { title: string; description: string }> = {
  permission_denied: {
    title: "위치를 알아야 주변 음식점을 찾을 수 있어요",
    description:
      "브라우저 주소창 왼쪽의 자물쇠 아이콘을 눌러 위치 권한을 허용한 뒤, 다시 시도해 주세요.",
  },
  position_unavailable: {
    title: "지금 위치를 확인하지 못했어요",
    description: "실내이거나 신호가 약할 때 생길 수 있습니다. 잠시 후 다시 시도해 주세요.",
  },
  unsupported: {
    title: "이 브라우저는 위치 기능을 지원하지 않아요",
    description: "크롬이나 사파리 같은 최신 브라우저에서 다시 열어 주세요.",
  },
  not_configured: {
    title: "서버 준비가 아직 안 됐어요",
    description: "장소 조회에 필요한 열쇠가 서버에 설정되지 않았습니다.",
  },
  quota_exceeded: {
    title: "오늘 조회 한도를 다 썼어요",
    description: "내일 다시 이용해 주세요.",
  },
  upstream_error: {
    title: "장소 정보를 가져오지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  network_error: {
    title: "서버에 연결하지 못했어요",
    description: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  },
};

const FALLBACK_ERROR = {
  title: "문제가 생겼어요",
  description: "잠시 후 다시 시도해 주세요.",
};

export default function Home() {
  const [view, setView] = useState<View>({ kind: "start" });

  async function start(radius: number) {
    setView({ kind: "loading" });

    try {
      const coords = await getCurrentPosition();
      const result = await fetchNearby(coords.lat, coords.lng, radius);
      const names = result.cuisines.map((cuisine) => cuisine.name);
      if (names.length === 0) {
        setView({ kind: "empty", radius });
        return;
      }
      setView({
        kind: "candidates",
        result,
        candidates: pickDistinct(names, CANDIDATE_COUNT, Math.random),
      });
    } catch (error) {
      // 서버가 준 오류는 코드를 그대로 쓰고,
      // 위치 확인 실패는 Error의 message에 이유가 담겨 온다.
      if (error instanceof NearbyError) {
        setView({ kind: "error", code: error.code, message: error.message });
        return;
      }
      const code = error instanceof Error ? error.message : "position_unavailable";
      setView({ kind: "error", code, message: "" });
    }
  }

  function reshuffle() {
    if (view.kind !== "candidates") return;
    const names = view.result.cuisines.map((cuisine) => cuisine.name);
    setView({
      ...view,
      candidates: pickAvoiding(names, CANDIDATE_COUNT, view.candidates, Math.random),
    });
  }

  function choose(cuisine: string) {
    if (view.kind !== "candidates") return;
    setView({ kind: "result", result: view.result, cuisine });
  }

  function decideForMe() {
    if (view.kind !== "candidates") return;
    const chosen = pickOne(view.candidates, Math.random);
    if (chosen) choose(chosen);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 p-6">
      {view.kind === "start" && <StartScreen onStart={() => start(DEFAULT_RADIUS)} loading={false} />}

      {view.kind === "loading" && <StartScreen onStart={() => {}} loading />}

      {view.kind === "candidates" && (
        <CandidateScreen
          candidates={view.candidates}
          onChoose={choose}
          onReshuffle={reshuffle}
          onDecideForMe={decideForMe}
        />
      )}

      {view.kind === "result" && (
        <ResultScreen
          cuisine={view.cuisine}
          places={view.result.places.filter((place) => place.cuisine === view.cuisine)}
          onRestart={() => setView({ kind: "start" })}
        />
      )}

      {view.kind === "empty" && (
        <Notice
          title={`반경 ${view.radius}m 안에 음식점이 없어요`}
          description="조금 더 넓게 찾아볼까요?"
          actions={WIDER_RADII.map((radius) => ({
            label: `${radius / 1000}km로 넓히기`,
            onClick: () => start(radius),
          }))}
        />
      )}

      {view.kind === "error" && (
        <Notice
          title={(ERROR_TEXT[view.code] ?? FALLBACK_ERROR).title}
          description={view.message || (ERROR_TEXT[view.code] ?? FALLBACK_ERROR).description}
          actions={[{ label: "다시 시도", onClick: () => start(DEFAULT_RADIUS) }]}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 6: 문서 제목과 언어를 고친다**

`web/app/layout.tsx`에서 `metadata`와 `<html lang>`만 바꾼다. 나머지(글꼴 설정, `globals.css` 불러오기)는 도구가 만든 그대로 둔다.

```tsx
export const metadata: Metadata = {
  title: "오늘 점심 뭐 먹지",
  description: "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.",
};
```

그리고 `<html lang="en">` 을 `<html lang="ko">` 로 바꾼다.

- [ ] **Step 7: 전부 확인한다**

```bash
cd web && npm test && npx tsc --noEmit && npm run lint && npm run build
```

기대: 시험 PASS, 타입 오류 없음, lint 통과, 빌드 성공.

- [ ] **Step 8: 두 서버를 함께 띄워 눈으로 확인한다**

```bash
cd api && go build -o /tmp/rc-server ./cmd/server && (/tmp/rc-server &) && sleep 1
cd web && (npm run dev &) && sleep 6
curl -s -w "\n%{http_code}\n" "http://localhost:3000/api/v1/nearby?lat=37.5&lng=127.0"
```

기대: Next.js를 통해 Go 서버에 닿아 `{"error":"not_configured",...}` 와 `500`이 돌아온다. 열쇠가 없으므로 이것이 정상이다. 이 응답이 오면 브라우저 → Next.js → Go 서버 연결이 살아 있다는 뜻이다.

확인 후 두 서버를 끈다:

```bash
pkill -f /tmp/rc-server; pkill -f "next dev"
```

- [ ] **Step 9: 커밋한다**

```bash
git add web/
git commit -m "feat(web): 시작·후보·결과 세 화면 추가"
```

**완료 확인:** Step 7의 네 명령이 모두 통과하고, Step 8에서 Next.js를 거쳐 Go 서버 응답이 돌아온다.

---

## 계획 전체의 완료 조건

설계 문서 12절을 그대로 옮긴 것이다. 마지막 Task가 끝난 뒤 아래를 한 번에 돌려 전부 통과해야 한다.

```bash
cd api && go build ./... && go test ./... && go vet ./... && cd ..
cd web && npm run build && npm test && npx tsc --noEmit && cd ..

# 저장소를 쓰는 코드가 없어야 한다 (출력이 비어 있어야 함)
grep -rn "localStorage\|sessionStorage\|database/sql\|redis" api/ web/app web/lib web/components

# 진짜 열쇠가 소스에 들어 있지 않아야 한다 (출력이 비어 있어야 함)
grep -rn "KakaoAK [A-Za-z0-9]" api/ web/app web/lib web/components | grep -v "_test\.go"

# 열쇠 없이 서버를 켜고 확인
cd api && go build -o /tmp/rc-server ./cmd/server && (/tmp/rc-server &) && sleep 1 && cd ..
curl -s "http://localhost:8080/api/v1/nearby?lat=37.5&lng=127.0"   # not_configured, 500
curl -s "http://localhost:8080/api/v1/nearby?lat=999&lng=127.0"    # invalid_coordinates, 400
pkill -f /tmp/rc-server
```

`grep`의 `KakaoAK [A-Za-z0-9]` 는 소스에 박힌 진짜 열쇠를 찾는 것이다. `client.go`의 `"KakaoAK "+c.apiKey` 는 뒤가 따옴표라 애초에 걸리지 않는다. 시험 파일은 뒤의 `grep -v`로 뺀다 — `client_test.go`가 인증 헤더를 확인하려면 `"KakaoAK test-key"` 문자열을 갖고 있어야 하고, `test-key`는 누가 봐도 가짜다.

## 남은 확인 (사람이 열쇠를 받은 뒤에 한다)

위 완료 조건과 별개로, 실제 데이터로만 확인할 수 있는 것이 하나 있다.

**음식 종류를 두 단계로 자르는 규칙이 실제 데이터에서 말이 되는가.** 설계 문서 7절에서 정한 규칙인데, 근거로 삼은 실제 값은 `"음식점 > 한식 > 육류,고기 > 곱창,막창"` 하나뿐이다. 열쇠를 받으면 다음을 돌려 실제 분포를 본다.

```bash
KAKAO_REST_API_KEY=<실제 열쇠> /tmp/rc-server &
curl -s "http://localhost:8080/api/v1/nearby?lat=37.4979&lng=127.0276&radius=500" | \
  python3 -c "import json,sys; [print(c['count'], c['name']) for c in json.load(sys.stdin)['cuisines']]"
```

보고 판단할 것:
- **[가장 먼저 볼 것] 같은 상위 분류 아래에 2단계짜리와 3단계 이상짜리가 함께 나오는가.**
  예를 들어 `한식`과 `한식 > 육류,고기`가 목록에 나란히 있으면, 사용자가 `한식`을 골랐을 때
  고깃집들은 다른 카드 뒤에 숨어 보이지 않는다. 나온다면 규칙을 고쳐야 한다.
  아래 명령으로 원본 분류 문자열을 직접 본다.
  ```bash
  curl -s "http://localhost:8080/api/v1/nearby?lat=37.4979&lng=127.0276&radius=500" |     python3 -c "import json,sys; [print(p['cuisine'],'|',p['name']) for p in json.load(sys.stdin)['places']]"
  ```
- 종류가 4개 미만이면 후보 화면이 빈약하다 → 기본 반경을 늘린다.
- 한 종류에 절반 이상이 몰리면 두 단계로도 안 좁혀진 것이다 → 세 단계를 검토한다.
- 대부분이 1곳짜리면 너무 잘게 쪼갠 것이다 → 한 단계로 줄인다.

판단 결과에 따라 `api/internal/cuisine/cuisine.go`의 `maxDepth` 하나만 고치면 된다. 시험 표도 함께 고친다.
