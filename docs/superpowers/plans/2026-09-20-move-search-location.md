# 위치를 옮겨 찾기 — 구현 계획

> **작업을 맡은 에이전트에게:** 이 계획은 `superpowers:subagent-driven-development`로 한 작업씩 실행한다. 각 단계는 체크박스(`- [ ]`)로 진행을 표시한다.

**목표:** 사용자가 `경주`처럼 장소 이름을 적어 그 자리를 고르면, 그 좌표로 지금과 똑같은 음식점 조회가 돌아가게 만든다.

**구조:** 좌표를 만드는 길을 하나 더 낸다. 지금은 브라우저 위치 확인(`web/lib/geo.ts`) 하나뿐인데, 여기에 카카오 장소 이름 검색으로 고른 좌표를 더한다. 좌표를 손에 넣은 뒤의 흐름(Go 서버 조회, 음식 종류 뽑기, 가게 고르기)은 한 줄도 바꾸지 않는다.

**기술 바탕:** Go 1.26.7(표준 라이브러리만), Next.js 16.3.3, React 19.2.8, vitest 4.1.11, Tailwind 4

**설계 문서:** `docs/superpowers/specs/2026-09-20-move-search-location-design.md` — 이 계획은 그 문서를 근거로 삼는다. 실행자는 둘 다 읽는다.

## 전체 제약

아래는 이 저장소 전체에 걸리는 규칙이다. 모든 작업의 요구사항에 이것이 포함된 것으로 본다.

- **Go 서버는 표준 라이브러리만 쓴다.** `api/go.mod`의 `require` 블록이 비어 있어야 한다. 외부 의존성을 추가하면 안 된다.
- **화면 시험은 브라우저 없이 node에서 돈다**(`web/vitest.config.mts`의 `environment: "node"`). jsdom도 testing-library도 없다. **판단이 들어가는 코드는 전부 `web/lib/`의 순수 함수로 뺀다.** `.tsx` 파일에는 시험이 붙지 않으므로 거기에 판단을 두면 아무도 지키지 않는다.
- **브라우저에 남기는 것은 사용자가 직접 친 글자뿐이다.** 카카오가 돌려준 장소 이름·장소식별값·좌표는 저장하지 않는다. 카카오가 저장을 허용한 예외는 "사용자가 직접 고른 장소의 장소식별값과 상호"까지이고 좌표는 그 문구에 없다.
- **새 시험을 쓰면 그 시험이 지키려는 방어를 일부러 껐을 때 실제로 실패하는지 확인한다.** 이 저장소에서 아무것도 지키지 않는 시험이 열세 번 나왔다. 모양이 늘 같다 — 방어 뒤에 또 다른 방어가 있으면, 바깥 방어를 통해 결과를 보는 시험은 안쪽 방어가 사라져도 초록불이다.
- **주석에 "왜"를 쓰기 전에 실제로 확인한다.** 이 저장소에서 주석의 근거가 코드와 어긋난 것이 여섯 번 나왔다. 동작이 맞아도 이유가 틀리면 그 주석을 믿고 고치는 다음 사람이 잘못 판단한다.
- **검증 명령은 `just check`** 하나다. 서버 시험·정적 분석, 화면 빌드·시험·타입 검사·린트를 순서대로 돌린다. `npm run build`가 `npx tsc --noEmit`보다 먼저 와야 한다(`app/layout.tsx`가 쓰는 타입을 Next.js가 빌드 중에 만들고 그 결과물은 저장소에 없다).
- **배포하지 않는다. 원격에 푸시하지 않는다. main에 머지하지 않는다.**
- **React·Next.js 코드를 쓸 때는 `vercel-react-best-practices`와 `vercel-composition-patterns`를 참조한다.** 다만 그 권고가 이 저장소의 기존 관례와 충돌하면 **기존 관례를 따르고** 그 사실을 판단 기록에 남긴다. 이 저장소는 최신 문법이 지원 하한 밖이었던 전례가 있다.

## 카카오 장소 이름 검색에 대해 확인된 사실

아래는 2026-09-20에 실제로 조회해 확인한 값이다. 구현 중에 이 전제를 다시 확인할 필요는 없다.

| 사실 | 값 |
|---|---|
| 경로 | `GET https://dapi.kakao.com/v2/local/search/keyword.json` |
| 인증 | `Authorization: KakaoAK <REST 키>` (음식점 조회와 같은 열쇠) |
| 한 번에 받을 수 있는 최대 | 15곳. `size=16`을 보내면 `should be at most 15`라는 400이 온다 |
| 한 검색어의 총 상한 | 45곳. 다만 검색어에 따라 그보다 적다(강남역 34곳, 홍대입구 36곳, 판교역 41곳) |
| 끝 표시 | 응답 `meta.is_end` |
| **함정** | 마지막 페이지를 넘겨 요청하면 오류가 아니라 **마지막 페이지를 그대로 다시 준다**. 15개씩 받을 때 4페이지가 3페이지와 같았고, 5개씩 받을 때 10페이지가 9페이지와 같았다 |
| 응답 항목 | `id` · `place_name` · `category_group_name` · `address_name` · `road_address_name` · `x`(경도) · `y`(위도) |

---

## 이 계획이 만드는 것

```
web/
├── app/page.tsx                    수정 — 화면 상태에 조회 기준점이 더해진다
├── app/api/v1/places/route.ts      신규 — 장소 검색을 Go 서버로 넘기는 껍데기
├── components/
│   ├── StartScreen.tsx             수정 — 단추가 둘 또는 셋
│   ├── SearchScreen.tsx            신규 — 위치 검색 화면
│   ├── CandidateScreen.tsx         수정 — 위에 기준 위치 줄
│   └── ResultScreen.tsx            수정 — 기준 위치 줄 + 후보로 돌아가기
└── lib/
    ├── anchor.ts                   신규 — 조회 기준점 타입, 검색어 저장, 표시 문구
    ├── spots.ts                    신규 — 검색 결과 이어 붙이기(중복 제거)
    ├── api.ts                      수정 — 장소 검색 호출
    ├── proxy.ts                    수정 — 넘길 경로를 인자로 받게 일반화
    └── errors.ts                   수정 — 검색 실패 안내 문구

api/internal/
├── kakao/spots.go                  신규 — 카카오 장소 이름 검색
└── httpapi/handler.go              수정 — GET /api/v1/places

api/cmd/server/main.go              수정 — 새 조회기를 넘긴다
README.md                           수정 — 화면 설명, 단추 이름, 저장하는 것, 한계
```

---

## Task 1: 서버가 카카오에 장소 이름을 물어본다

**파일**
- 신규: `api/internal/kakao/spots.go`
- 신규: `api/internal/kakao/spots_test.go`

**주고받는 것**
- 쓰는 것: 같은 패키지의 `Client` 구조체, `document`·`searchResponse` 타입, `finiteFloat`, `stripURL`, `describeErrorBody`, `ErrQuotaExceeded`·`ErrInvalidKey`·`ErrUpstream`, 상수 `pageSize`(15)·`requestTimeout`·`errorBodyLimit`
- 내놓는 것: `kakao.Spot` 타입과 `(*Client).SearchSpots(ctx context.Context, query string, page int) ([]Spot, bool, error)`

**참조할 스킬·에이전트:** 없음(순수 Go). 작업 뒤 리뷰는 subagent-driven-development의 검토 단계가 맡는다.

**완료조건:** `cd api && go test ./internal/kakao/ -run Spot -v`가 통과하고, `go vet ./...`가 종료코드 0.

- [ ] **단계 1: 실패하는 시험을 쓴다**

`api/internal/kakao/spots_test.go`를 만든다. 가짜 카카오 서버 패턴은 같은 폴더의 `client_test.go`를 그대로 따른다.

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

// spotPageJSON은 카카오 장소 이름 검색 응답 한 페이지를 흉내 낸다.
// page를 식별자에 섞는 이유는 client_test.go의 pageJSON과 같다 —
// 페이지마다 다른 장소가 오는 것이 실제 모습이고, 같은 식별자를 주면
// 중복 제거가 실제로 도는지 확인할 수 없다.
func spotPageJSON(page, count int, isEnd bool) string {
	docs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		docs = append(docs, fmt.Sprintf(`{
			"id": "s%d-%d",
			"place_name": "장소%d-%d",
			"category_group_name": "관광명소",
			"address_name": "경북 경주시 인왕동 %d",
			"road_address_name": "경북 경주시 원화로 %d",
			"x": "129.21%02d",
			"y": "35.83%02d"
		}`, page, i, page, i, i, i, i, i))
	}
	return fmt.Sprintf(`{"documents": [%s], "meta": {"is_end": %t}}`,
		strings.Join(docs, ","), isEnd)
}

func TestSearchSpotsReturnsOnePage(t *testing.T) {
	var gotQuery, gotPage, gotSize string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query().Get("query")
		gotPage = r.URL.Query().Get("page")
		gotSize = r.URL.Query().Get("size")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spotPageJSON(1, 15, false))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, isEnd, err := client.SearchSpots(context.Background(), "경주", 1)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(spots) != 15 {
		t.Fatalf("15곳을 기대했는데 %d곳이다", len(spots))
	}
	if isEnd {
		t.Error("is_end가 false인 응답인데 끝났다고 답했다")
	}
	if gotQuery != "경주" {
		t.Errorf("검색어를 그대로 보내야 한다: %q", gotQuery)
	}
	// size는 카카오가 허용하는 최대값이어야 한다. 이보다 크면 400이 오고,
	// 작으면 같은 45곳을 받는 데 호출이 더 든다.
	if gotSize != "15" {
		t.Errorf("size는 15여야 한다: %q", gotSize)
	}
	if gotPage != "1" {
		t.Errorf("page를 그대로 보내야 한다: %q", gotPage)
	}
	if spots[0].Name != "장소1-0" || spots[0].Address != "경북 경주시 원화로 0" {
		t.Errorf("장소 이름과 주소를 옮기지 못했다: %+v", spots[0])
	}
	if spots[0].Category != "관광명소" {
		t.Errorf("분류를 옮기지 못했다: %+v", spots[0])
	}
	// 카카오는 x가 경도, y가 위도다. 바꿔 읽으면 지구 반대편을 조회하게 된다.
	if spots[0].Lng < 129 || spots[0].Lng > 130 || spots[0].Lat < 35 || spots[0].Lat > 36 {
		t.Errorf("경도와 위도가 뒤바뀌었다: lat=%v lng=%v", spots[0].Lat, spots[0].Lng)
	}
}

func TestSearchSpotsReportsEnd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spotPageJSON(3, 4, true))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, isEnd, err := client.SearchSpots(context.Background(), "강남역", 3)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if !isEnd {
		t.Error("카카오가 끝이라고 했으면 그대로 알려야 한다")
	}
	if len(spots) != 4 {
		t.Fatalf("4곳을 기대했는데 %d곳이다", len(spots))
	}
}

// 한 페이지만 부르는지 확인한다. 음식점 조회(SearchRestaurants)는 세 페이지를
// 스스로 도는데, 장소 검색은 `더 보기`를 누를 때마다 한 페이지씩 받아야 하므로
// 여기서 여러 페이지를 돌면 화면이 통제할 수 없게 된다.
func TestSearchSpotsCallsKakaoOnce(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spotPageJSON(1, 15, false))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	if _, _, err := client.SearchSpots(context.Background(), "경주", 1); err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 1 {
		t.Errorf("카카오를 한 번만 불러야 하는데 %d번 불렀다", calls)
	}
}

// 도로명 주소가 비면 지번 주소로 대신한다. 둘 다 비는 장소는 드물지만,
// 주소가 빈 줄이 목록에 뜨면 사용자가 어디인지 알 수 없다.
func TestSearchSpotsFallsBackToLotAddress(t *testing.T) {
	body := `{"documents":[{"id":"s1","place_name":"이름","category_group_name":"",
		"address_name":"경북 경주시 인왕동 1","road_address_name":"","x":"129.2","y":"35.8"}],
		"meta":{"is_end":true}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, body)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, _, err := client.SearchSpots(context.Background(), "경주", 1)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if spots[0].Address != "경북 경주시 인왕동 1" {
		t.Errorf("도로명이 비면 지번을 써야 한다: %q", spots[0].Address)
	}
}

// 좌표를 읽지 못한 한 건은 버리고 나머지는 살린다. 좌표가 없으면 그 장소를
// 골라도 조회할 자리가 없고, NaN·무한대는 JSON으로 만들 수 없어 응답 전체를 실패시킨다.
func TestSearchSpotsDropsUnreadableCoordinates(t *testing.T) {
	body := `{"documents":[
		{"id":"bad","place_name":"좌표이상","category_group_name":"","address_name":"주소","road_address_name":"","x":"NaN","y":"35.8"},
		{"id":"good","place_name":"멀쩡","category_group_name":"","address_name":"주소","road_address_name":"","x":"129.2","y":"35.8"}],
		"meta":{"is_end":true}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, body)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, _, err := client.SearchSpots(context.Background(), "경주", 1)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(spots) != 1 || spots[0].ID != "good" {
		t.Errorf("좌표를 못 읽은 한 건만 버려야 한다: %+v", spots)
	}
}

func TestSearchSpotsMapsErrorStatuses(t *testing.T) {
	cases := []struct {
		name   string
		status int
		want   error
	}{
		{"한도 초과", http.StatusTooManyRequests, ErrQuotaExceeded},
		{"열쇠 거부", http.StatusUnauthorized, ErrInvalidKey},
		{"권한 없음", http.StatusForbidden, ErrInvalidKey},
		{"서버 오류", http.StatusInternalServerError, ErrUpstream},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
			}))
			defer server.Close()

			client := NewClientWithBaseURL("test-key", server.URL, server.Client())
			_, _, err := client.SearchSpots(context.Background(), "경주", 1)
			if !errors.Is(err, tc.want) {
				t.Errorf("%v를 기대했는데 %v가 왔다", tc.want, err)
			}
		})
	}
}

// 오류 본문에 검색어와 열쇠가 실려 나가지 않아야 한다. 카카오 앞에 게이트웨이가
// 있으면 그것이 답하는 오류 문서에 요청한 주소가 되울려 들어올 수 있다.
func TestSearchSpotsErrorHidesSecrets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, `{"errorType":"Gateway","message":"실패: %s (key=test-key)"}`, r.URL.String())
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, _, err := client.SearchSpots(context.Background(), "비밀장소", 1)
	if err == nil {
		t.Fatal("오류가 나야 한다")
	}
	if strings.Contains(err.Error(), "test-key") {
		t.Errorf("오류에 카카오 열쇠가 들어 있다: %v", err)
	}
	if strings.Contains(err.Error(), "비밀장소") {
		t.Errorf("오류에 검색어가 들어 있다: %v", err)
	}
}
```

- [ ] **단계 2: 시험이 실패하는 것을 확인한다**

실행: `cd api && go test ./internal/kakao/ -run Spot`
기대: `undefined: Spot` 또는 `client.SearchSpots undefined`로 컴파일 실패

- [ ] **단계 3: 최소 구현을 쓴다**

`api/internal/kakao/spots.go`를 만든다. `client.go`와 나눠 두는 이유는 그 파일이 이미 520줄을 넘었고, 장소 검색은 음식점 조회와 부르는 경로도 다루는 값도 다르기 때문이다.

```go
package kakao

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
)

// spotSearchPath는 장소를 이름으로 찾는 카카오 경로다.
// 음식점 조회가 쓰는 category.json과 다른 경로이고, 분류 코드 대신 검색어를 받는다.
const spotSearchPath = "/v2/local/search/keyword.json"

// Spot은 음식점을 찾을 기준으로 삼을 장소 한 곳이다.
//
// Place와 나눠 두는 이유가 둘이다. 장소 검색은 기준 좌표 없이 부르므로 거리가
// 아예 없고, 카카오가 주는 분류도 쓰임이 다르다 — Place의 CategoryName은
// 음식 종류를 계산하는 입력이지만, Spot의 Category는 화면에 그대로 붙이는 꼬리표다.
type Spot struct {
	ID       string
	Name     string
	Address  string
	Category string
	Lat      float64
	Lng      float64
}

// spotDocument는 카카오 장소 검색 응답 한 건이다.
//
// client.go의 document를 그대로 쓰지 않는 이유: 그쪽에는 이 응답에 없는 항목
// (distance·phone·place_url)이 있고, 반대로 이 응답에만 있는 category_group_name이
// 없다. 한 타입으로 합치면 어느 항목이 어느 경로에서 채워지는지가 흐려진다.
type spotDocument struct {
	ID          string `json:"id"`
	PlaceName   string `json:"place_name"`
	CategoryName string `json:"category_group_name"`
	AddressName string `json:"address_name"`
	RoadAddress string `json:"road_address_name"`
	X           string `json:"x"`
	Y           string `json:"y"`
}

type spotResponse struct {
	Documents []spotDocument `json:"documents"`
	Meta      struct {
		IsEnd bool `json:"is_end"`
	} `json:"meta"`
}

// SearchSpots는 이름이나 주소로 장소를 찾아 한 페이지만 돌려준다.
// 두 번째 반환값은 카카오가 "더 없다"고 알렸는지다(meta.is_end).
//
// **여러 페이지를 스스로 돌지 않는다.** 음식점 조회(SearchRestaurants)는 세 페이지를
// 한 번에 도는데, 장소 검색은 사용자가 `더 보기`를 누를 때마다 한 페이지씩 받아야
// 하므로 그 통제를 화면에 남긴다.
//
// **부르는 쪽은 반드시 두 번째 반환값을 보고 멈춰야 한다.** 카카오는 마지막
// 페이지를 넘겨 요청해도 오류를 주지 않고 마지막 페이지를 그대로 다시 준다
// (2026-09-20 실측: 15개씩 받을 때 4페이지가 3페이지와 같았다). 이것을 모르고
// 페이지를 계속 올리면 같은 장소가 목록에 끝없이 쌓인다.
func (c *Client) SearchSpots(ctx context.Context, query string, page int) ([]Spot, bool, error) {
	parsed, err := c.fetchSpotPage(ctx, query, page)
	if err != nil {
		return nil, false, err
	}

	spots := make([]Spot, 0, len(parsed.Documents))
	for _, doc := range parsed.Documents {
		spot, badField := toSpot(doc)
		if badField != "" {
			// 조용히 버리지 않는다. 카카오 응답 형식이 바뀌면 알아야 한다.
			// 검색어는 남기지 않는다 — 사용자가 어디를 찾아봤는지가 로그에 쌓인다.
			slog.Warn("카카오 장소 응답 한 건을 해석하지 못해 건너뜁니다", "field", badField)
			continue
		}
		spots = append(spots, spot)
	}
	return spots, parsed.Meta.IsEnd, nil
}

func (c *Client) fetchSpotPage(ctx context.Context, query string, page int) (*spotResponse, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("page", strconv.Itoa(page))
	// 카카오가 허용하는 최대값이다. 이보다 크면 400이 오고, 작으면 같은 수를
	// 받는 데 호출이 더 든다. client.go의 pageSize와 같은 값을 쓴다.
	params.Set("size", strconv.Itoa(pageSize))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+spotSearchPath+"?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("%w: 요청을 만들지 못했습니다: %w", ErrUpstream, stripURL(err))
	}
	req.Header.Set("Authorization", "KakaoAK "+c.apiKey)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUpstream, stripURL(err))
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusTooManyRequests {
		return nil, ErrQuotaExceeded
	}
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("%w: 응답 코드 %d", ErrInvalidKey, res.StatusCode)
	}
	if res.StatusCode != http.StatusOK {
		snippet, readErr := io.ReadAll(io.LimitReader(res.Body, errorBodyLimit))
		if readErr != nil && (ctx.Err() != nil || errors.Is(readErr, context.DeadlineExceeded)) {
			cause := ctx.Err()
			if cause == nil {
				cause = readErr
			}
			return nil, fmt.Errorf("%w: 응답 코드 %d: 본문을 읽지 못했습니다: %w",
				ErrUpstream, res.StatusCode, cause)
		}
		// 감출 값에 검색어를 넣는다. 사용자가 어디를 찾아봤는지는 좌표만큼은 아니어도
		// 사생활에 닿는 값이고, 게이트웨이 오류 문서에 요청 주소가 되울려 들어오면
		// 그대로 로그에 실린다.
		return nil, fmt.Errorf("%w: 응답 코드 %d: %s", ErrUpstream, res.StatusCode,
			describeErrorBody(snippet, c.apiKey, query))
	}

	var parsed spotResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("%w: 응답을 해석하지 못했습니다: %w", ErrUpstream, err)
	}
	return &parsed, nil
}

// toSpot은 카카오 응답 한 건을 우리 형태로 옮긴다.
// 두 번째 반환값은 해석하지 못한 항목의 이름이고, 전부 성공하면 빈 문자열이다.
//
// 좌표를 읽지 못하면 그 한 건을 버린다. 좌표가 없는 장소는 골라도 조회할 자리가
// 없고, NaN과 무한대는 JSON으로 표현할 수 없어 응답을 만드는 단계에서 실패한다.
func toSpot(doc spotDocument) (Spot, string) {
	lng, ok := finiteFloat(doc.X)
	if !ok {
		return Spot{}, "x"
	}
	lat, ok := finiteFloat(doc.Y)
	if !ok {
		return Spot{}, "y"
	}

	// 도로명이 비면 지번으로 대신한다. client.go의 toPlace와 같은 규칙이다 —
	// 주소가 빈 줄이 목록에 뜨면 사용자가 그곳이 어디인지 알 수 없다.
	address := doc.RoadAddress
	if address == "" {
		address = doc.AddressName
	}
	return Spot{
		ID:       doc.ID,
		Name:     doc.PlaceName,
		Address:  address,
		Category: doc.CategoryName,
		Lat:      lat,
		Lng:      lng,
	}, ""
}
```

- [ ] **단계 4: 시험이 통과하는 것을 확인한다**

실행: `cd api && go test ./internal/kakao/ -run Spot -v`
기대: 모두 PASS

- [ ] **단계 5: 방어를 꺼서 시험이 실제로 일하는지 확인한다**

전체 제약의 "방어를 껐을 때 실제로 실패하는가"를 여기서 지킨다. 아래를 하나씩 해 보고 **각각 어느 시험이 실패하는지 기록한 뒤 되돌린다.**

1. `toSpot`의 `finiteFloat` 검사를 지우고 `strconv.ParseFloat`의 결과를 그대로 쓴다 → `TestSearchSpotsDropsUnreadableCoordinates`가 실패해야 한다
2. `params.Set("size", ...)`의 값을 `10`으로 바꾼다 → `TestSearchSpotsReturnsOnePage`의 size 확인이 실패해야 한다
3. `describeErrorBody`의 인자에서 `query`를 뺀다 → `TestSearchSpotsErrorHidesSecrets`가 실패해야 한다
4. `toSpot`에서 `lat`과 `lng`를 바꿔 넣는다 → `TestSearchSpotsReturnsOnePage`의 좌표 확인이 실패해야 한다

**하나라도 통과해 버리면 그 시험은 아무것도 지키지 않는 것이므로 시험을 고친다.**

- [ ] **단계 6: 검증하고 커밋한다**

```bash
cd api && go test ./... && go vet ./...
cd .. && git add api/internal/kakao/spots.go api/internal/kakao/spots_test.go
git commit -m "feat(api): 카카오에 장소를 이름으로 물어보는 기능을 더한다"
```

---

## Task 2: 서버가 장소 검색 경로를 연다

**파일**
- 수정: `api/internal/httpapi/handler.go`
- 수정: `api/internal/httpapi/handler_test.go`
- 수정: `api/cmd/server/main.go:41-46,57`

**주고받는 것**
- 쓰는 것: Task 1의 `kakao.Spot`과 `(*Client).SearchSpots`
- 내놓는 것: `GET /api/v1/places?query=<검색어>&page=<쪽 번호>` → `{"spots":[{"id","name","address","category","lat","lng"}],"isEnd":bool}`. 오류 코드 `invalid_query`(400)가 는다

**참조할 스킬·에이전트:** 없음(순수 Go)

**완료조건:** `cd api && go test ./... && go vet ./...`가 종료코드 0이고, 새 경로가 비밀값 헤더 없이는 401로 막힌다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

`api/internal/httpapi/handler_test.go` 끝에 더한다. `fakeFinder` 옆에 장소 검색용 가짜를 새로 만든다.

```go
// fakeSpots는 카카오 장소 검색 대신 미리 정해 둔 답을 돌려준다.
// calls를 세는 이유는 fakeFinder와 같다 — 비밀값 검사가 카카오를 부르기 전에
// 막는지 확인해야 하기 때문이다.
type fakeSpots struct {
	spots    []kakao.Spot
	isEnd    bool
	err      error
	calls    int
	gotQuery string
	gotPage  int
}

func (f *fakeSpots) SearchSpots(_ context.Context, query string, page int) ([]kakao.Spot, bool, error) {
	f.calls++
	f.gotQuery, f.gotPage = query, page
	return f.spots, f.isEnd, f.err
}

func TestPlacesReturnsSpots(t *testing.T) {
	spots := &fakeSpots{
		spots: []kakao.Spot{
			{ID: "s1", Name: "경주 황리단길", Address: "경북 경주시 황남동", Category: "관광명소", Lat: 35.83, Lng: 129.21},
		},
		isEnd: true,
	}
	handler := NewHandler(&fakeFinder{}, spots, "")
	rec := get(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC&page=1")

	if rec.Code != http.StatusOK {
		t.Fatalf("200을 기대했는데 %d다: %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Spots []struct {
			ID, Name, Address, Category string
			Lat, Lng                    float64
		} `json:"spots"`
		IsEnd bool `json:"isEnd"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("응답을 해석하지 못했다: %v", err)
	}
	if len(got.Spots) != 1 || got.Spots[0].Name != "경주 황리단길" {
		t.Errorf("장소를 그대로 옮겨야 한다: %+v", got.Spots)
	}
	if !got.IsEnd {
		t.Error("끝 표시를 그대로 옮겨야 한다")
	}
	if spots.gotQuery != "경주" {
		t.Errorf("검색어를 그대로 넘겨야 한다: %q", spots.gotQuery)
	}
	if spots.gotPage != 1 {
		t.Errorf("쪽 번호를 그대로 넘겨야 한다: %d", spots.gotPage)
	}
}

// page를 생략하면 1쪽으로 본다. 화면이 첫 조회에서 page를 안 붙여도 되게 한다.
func TestPlacesDefaultsToFirstPage(t *testing.T) {
	spots := &fakeSpots{isEnd: true}
	handler := NewHandler(&fakeFinder{}, spots, "")
	rec := get(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC")

	if rec.Code != http.StatusOK {
		t.Fatalf("200을 기대했는데 %d다", rec.Code)
	}
	if spots.gotPage != 1 {
		t.Errorf("생략하면 1쪽이어야 한다: %d", spots.gotPage)
	}
}

func TestPlacesRejectsBadQuery(t *testing.T) {
	cases := []struct {
		name   string
		target string
	}{
		{"검색어 없음", "/api/v1/places"},
		{"검색어가 빈 문자열", "/api/v1/places?query="},
		{"공백만", "/api/v1/places?query=%20%20"},
		{"쪽 번호가 0", "/api/v1/places?query=%EA%B2%BD%EC%A3%BC&page=0"},
		{"쪽 번호가 음수", "/api/v1/places?query=%EA%B2%BD%EC%A3%BC&page=-1"},
		{"쪽 번호가 숫자가 아님", "/api/v1/places?query=%EA%B2%BD%EC%A3%BC&page=abc"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			spots := &fakeSpots{}
			handler := NewHandler(&fakeFinder{}, spots, "")
			rec := get(t, handler, tc.target)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("400을 기대했는데 %d다", rec.Code)
			}
			// 값이 잘못됐으면 카카오를 부르기 전에 막아야 한다.
			// 부르고 나서 막으면 응답은 거절이어도 하루 한도는 그대로 깎인다.
			if spots.calls != 0 {
				t.Errorf("카카오를 부르면 안 되는데 %d번 불렀다", spots.calls)
			}
		})
	}
}

// 비밀값 검사가 이 경로에도 걸려야 한다. 걸리지 않으면 조회 한도를 지키려고
// 만든 장치에 구멍이 하나 생긴다.
func TestPlacesRequiresInternalKey(t *testing.T) {
	spots := &fakeSpots{}
	handler := NewHandler(&fakeFinder{}, spots, "secret")
	rec := get(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("401을 기대했는데 %d다", rec.Code)
	}
	if spots.calls != 0 {
		t.Errorf("막기 전에 카카오를 부르면 안 되는데 %d번 불렀다", spots.calls)
	}
}

func TestPlacesAcceptsCorrectInternalKey(t *testing.T) {
	spots := &fakeSpots{isEnd: true}
	handler := NewHandler(&fakeFinder{}, spots, "secret")
	rec := getWithHeaders(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC",
		map[string]string{internalKeyHeader: "secret"})

	if rec.Code != http.StatusOK {
		t.Fatalf("200을 기대했는데 %d다: %s", rec.Code, rec.Body.String())
	}
}

func TestPlacesWithoutKakaoKey(t *testing.T) {
	handler := NewHandler(nil, nil, "")
	rec := get(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("500을 기대했는데 %d다", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "not_configured") {
		t.Errorf("not_configured를 답해야 한다: %s", rec.Body.String())
	}
}

func TestPlacesMapsUpstreamErrors(t *testing.T) {
	cases := []struct {
		name     string
		err      error
		wantCode int
		wantBody string
	}{
		{"한도 초과", kakao.ErrQuotaExceeded, http.StatusTooManyRequests, "quota_exceeded"},
		{"열쇠 거부", kakao.ErrInvalidKey, http.StatusInternalServerError, "invalid_key"},
		{"그 밖의 실패", kakao.ErrUpstream, http.StatusBadGateway, "upstream_error"},
		{"시간 초과", context.DeadlineExceeded, http.StatusGatewayTimeout, "timeout"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewHandler(&fakeFinder{}, &fakeSpots{err: tc.err}, "")
			rec := get(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC")
			if rec.Code != tc.wantCode {
				t.Fatalf("%d를 기대했는데 %d다", tc.wantCode, rec.Code)
			}
			if !strings.Contains(rec.Body.String(), tc.wantBody) {
				t.Errorf("%s를 답해야 한다: %s", tc.wantBody, rec.Body.String())
			}
		})
	}
}

// 카카오가 결과 저장을 금지하므로 이 응답도 캐시되면 안 된다.
func TestPlacesForbidsCaching(t *testing.T) {
	handler := NewHandler(&fakeFinder{}, &fakeSpots{isEnd: true}, "")
	rec := get(t, handler, "/api/v1/places?query=%EA%B2%BD%EC%A3%BC")
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("no-store여야 한다: %q", got)
	}
}
```

기존 시험 중 `NewHandler(`를 부르는 곳이 전부 깨진다. 인자가 하나 늘었기 때문이다. 아래로 일괄 수정한다.

```bash
cd api && grep -n "NewHandler(" internal/httpapi/handler_test.go cmd/server/main_test.go
```

각 호출에서 첫 인자 뒤에 장소 검색 가짜를 넣는다. 음식점 조회만 보는 기존 시험은 `&fakeSpots{}`를, `nil`을 넘기던 곳은 `nil, nil`로 바꾼다.

- [ ] **단계 2: 시험이 실패하는 것을 확인한다**

실행: `cd api && go test ./internal/httpapi/`
기대: `not enough arguments in call to NewHandler`로 컴파일 실패

- [ ] **단계 3: 최소 구현을 쓴다**

`api/internal/httpapi/handler.go`를 고친다.

```go
// SpotFinder는 이름으로 장소를 찾아 주는 무언가다.
// PlaceFinder와 나눠 두는 이유: 이 둘은 실제로는 같은 카카오 조회기가 제공하지만,
// 계약을 합치면 음식점 조회만 가짜로 두고 싶은 시험이 쓰지 않을 메서드까지
// 구현해야 한다. 나눠 두면 각 경로의 동작을 따로 확인할 수 있다.
type SpotFinder interface {
	SearchSpots(ctx context.Context, query string, page int) ([]kakao.Spot, bool, error)
}

type spotDTO struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Address  string  `json:"address"`
	Category string  `json:"category"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
}

type placesResponse struct {
	Spots []spotDTO `json:"spots"`
	// IsEnd는 카카오가 "더 없다"고 알렸는지다.
	// **화면은 이 값을 보고 `더 보기`를 감춰야 한다.** 카카오는 마지막 페이지를
	// 넘겨 요청해도 오류 대신 마지막 페이지를 그대로 다시 주므로, 이 값을 무시하면
	// 같은 장소가 목록에 끝없이 쌓인다.
	IsEnd bool `json:"isEnd"`
}
```

`NewHandler`의 서명을 바꾸고 경로를 더한다.

```go
func NewHandler(finder PlaceFinder, spots SpotFinder, internalKey string) http.Handler {
	// ... wantKey 계산은 그대로 ...

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/nearby", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, wantKey) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "허가되지 않은 요청입니다.")
			return
		}
		handleNearby(w, r, finder)
	})
	mux.HandleFunc("GET /api/v1/places", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r, wantKey) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "허가되지 않은 요청입니다.")
			return
		}
		handlePlaces(w, r, spots)
	})
	// ... healthz·readyz는 그대로 ...
}
```

`handlePlaces`와 값 검사를 더한다.

```go
func handlePlaces(w http.ResponseWriter, r *http.Request, spots SpotFinder) {
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	if query == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "찾을 장소 이름이 비어 있습니다.")
		return
	}
	page, ok := parsePage(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_query", "쪽 번호가 올바르지 않습니다.")
		return
	}

	// 요청 자체가 잘못됐는지를 먼저 가린 다음에 서버 설정을 본다.
	// handleNearby와 같은 순서다 — 잘못된 요청은 열쇠가 있든 없든 400이어야 한다.
	if spots == nil {
		writeError(w, http.StatusInternalServerError, "not_configured",
			"서버에 카카오 열쇠가 설정되지 않았습니다.")
		return
	}

	found, isEnd, err := spots.SearchSpots(r.Context(), query, page)
	if err != nil {
		// 아래 로그에 검색어를 남기지 않는다. 사용자가 어디를 찾아봤는지가
		// 로그에 쌓이는 것은 좌표를 남기지 않기로 한 것과 같은 이유로 피한다.
		if r.Context().Err() != nil {
			slog.Info("장소 검색 요청이 취소되었습니다")
			return
		}
		if errors.Is(err, context.DeadlineExceeded) {
			slog.Warn("장소 검색이 제한 시간 안에 끝나지 않았습니다")
			writeError(w, http.StatusGatewayTimeout, "timeout",
				"조회가 제한 시간 안에 끝나지 않았습니다.")
			return
		}
		if errors.Is(err, kakao.ErrQuotaExceeded) {
			slog.Warn("카카오 호출 한도를 소진했습니다")
			writeError(w, http.StatusTooManyRequests, "quota_exceeded",
				"오늘 조회 한도를 다 썼습니다. 내일 다시 이용해 주세요.")
			return
		}
		if errors.Is(err, kakao.ErrInvalidKey) {
			slog.Error("카카오가 열쇠를 거부했습니다", "error", err)
			writeError(w, http.StatusInternalServerError, "invalid_key",
				"서버의 카카오 열쇠가 유효하지 않습니다.")
			return
		}
		slog.Error("장소 검색에 실패했습니다", "error", err)
		writeError(w, http.StatusBadGateway, "upstream_error", "장소 정보를 가져오지 못했습니다.")
		return
	}

	dtos := make([]spotDTO, 0, len(found))
	for _, s := range found {
		dtos = append(dtos, spotDTO{
			ID: s.ID, Name: s.Name, Address: s.Address,
			Category: s.Category, Lat: s.Lat, Lng: s.Lng,
		})
	}
	writeJSON(w, http.StatusOK, placesResponse{Spots: dtos, IsEnd: isEnd})
}

// parsePage는 쪽 번호를 읽는다. 없으면 1쪽으로 본다.
// 상한을 두지 않는 이유: 카카오가 마지막 페이지 너머를 요청받으면 오류 대신
// 마지막 페이지를 다시 주므로, 큰 수가 와도 사고가 나지 않는다. 다만 0 이하는
// 카카오가 400으로 답하므로 여기서 먼저 막아 호출 한도를 아낀다.
func parsePage(r *http.Request) (int, bool) {
	raw := r.URL.Query().Get("page")
	if raw == "" {
		return 1, true
	}
	page, err := strconv.Atoi(raw)
	if err != nil || page < 1 {
		return 0, false
	}
	return page, true
}
```

`readyz`도 고친다. 장소 검색만 설정되지 않은 상태는 실제로 생기지 않지만(둘 다 같은 열쇠에서 나온다), 한쪽만 보면 나중에 그 전제가 깨졌을 때 초록불이 거짓말을 한다.

```go
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		if finder == nil || spots == nil {
			writeError(w, http.StatusServiceUnavailable, "not_configured",
				"서버에 카카오 열쇠가 설정되지 않았습니다.")
			return
		}
		writeOK(w)
	})
```

`import`에 `strings`를 더한다.

`api/cmd/server/main.go`의 41~46줄과 57줄을 고친다.

```go
	// 열쇠가 없으면 조회기를 만들지 않는다. 그러면 조회 요청은 not_configured로 답한다.
	// 서버 자체는 정상적으로 떠서, 무엇이 빠졌는지 응답으로 알 수 있다.
	var finder httpapi.PlaceFinder
	var spots httpapi.SpotFinder
	if key := os.Getenv("KAKAO_REST_API_KEY"); key != "" {
		// 같은 조회기가 두 계약을 모두 만족한다. 둘을 따로 받는 것은 시험에서
		// 한쪽만 가짜로 둘 수 있게 하기 위해서다(httpapi.SpotFinder 주석 참고).
		client := kakao.NewClient(key)
		finder, spots = client, client
	} else {
		slog.Warn("KAKAO_REST_API_KEY가 없습니다. 조회 요청은 not_configured로 응답합니다")
	}
```

```go
		Handler: httpapi.NewHandler(finder, spots, internalKey),
```

- [ ] **단계 4: 시험이 통과하는 것을 확인한다**

실행: `cd api && go test ./... -v -run "Places|Nearby|Ready"`
기대: 모두 PASS

- [ ] **단계 5: 방어를 꺼서 시험이 실제로 일하는지 확인한다**

하나씩 해 보고 어느 시험이 실패하는지 기록한 뒤 되돌린다.

1. `/api/v1/places` 처리기에서 `authorized` 검사를 지운다 → `TestPlacesRequiresInternalKey`가 실패해야 한다
2. `handlePlaces`에서 값 검사보다 `SearchSpots` 호출을 먼저 오게 바꾼다 → `TestPlacesRejectsBadQuery`의 `calls != 0` 확인이 실패해야 한다
3. `strings.TrimSpace`를 지운다 → `TestPlacesRejectsBadQuery`의 "공백만"이 실패해야 한다
4. `placesResponse`의 `IsEnd`를 언제나 `false`로 둔다 → `TestPlacesReturnsSpots`가 실패해야 한다

- [ ] **단계 6: 검증하고 커밋한다**

```bash
cd api && go test ./... && go vet ./...
cd .. && git add api/
git commit -m "feat(api): 장소 검색 경로 GET /api/v1/places를 연다"
```

---

## Task 3: 화면 서버가 장소 검색을 넘긴다

**파일**
- 수정: `web/lib/proxy.ts`
- 수정: `web/lib/proxy.test.ts`
- 수정: `web/app/api/v1/nearby/route.ts`
- 신규: `web/app/api/v1/places/route.ts`

**주고받는 것**
- 쓰는 것: Task 2의 `GET /api/v1/places`
- 내놓는 것: `proxyToApi(path: string, search: string, apiOrigin: string, internalKey: string, fetcher: Fetcher): Promise<Response>`. 기존 `proxyNearby`는 이것을 부르는 얇은 껍데기로 남긴다

**참조할 스킬·에이전트:** `vercel-react-best-practices`(라우트 핸들러가 요청마다 도는지 확인)

**완료조건:** `cd web && npx vitest run lib/proxy.test.ts`가 통과하고, 두 라우트가 각자의 경로로 넘기는 것이 시험으로 확인된다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/proxy.test.ts`에 더한다. 기존 시험은 그대로 둔다(`proxyNearby`가 남으므로 계속 통과해야 한다).

```typescript
import { proxyToApi } from "./proxy";

describe("경로를 받아 넘기기", () => {
  it("받은 경로와 질의 문자열을 그대로 붙여 부른다", async () => {
    let calledUrl = "";
    const fetcher = async (url: string) => {
      calledUrl = url;
      return new Response('{"spots":[],"isEnd":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    await proxyToApi("/api/v1/places", "?query=경주&page=2", "http://api.test", "", fetcher);
    expect(calledUrl).toBe("http://api.test/api/v1/places?query=경주&page=2");
  });

  it("비밀 헤더를 붙인다", async () => {
    let gotHeaders: HeadersInit | undefined;
    const fetcher = async (_url: string, init?: RequestInit) => {
      gotHeaders = init?.headers;
      return new Response("{}", { status: 200 });
    };
    await proxyToApi("/api/v1/places", "?query=경주", "http://api.test", "s3cret", fetcher);
    expect(gotHeaders).toEqual({ "X-Internal-Key": "s3cret" });
  });

  // 조회 서버에 닿지 못했을 때, 장소 검색에서도 같은 오류 코드로 답해야 한다.
  // 코드가 다르면 화면의 안내 표(errors.ts)에 없는 코드가 되어 기본 문구로 떨어지고,
  // 눌러도 낫지 않는 다시 시도 단추가 다시 그려진다.
  it("조회 서버에 닿지 못하면 api_unreachable로 답한다", async () => {
    const fetcher = async () => {
      throw new TypeError("fetch failed");
    };
    const res = await proxyToApi("/api/v1/places", "?query=경주", "http://api.test", "", fetcher);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("api_unreachable");
  });

  it("캐시 금지를 붙인다", async () => {
    const fetcher = async () => new Response("{}", { status: 200 });
    const res = await proxyToApi("/api/v1/places", "?query=경주", "http://api.test", "", fetcher);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
```

- [ ] **단계 2: 시험이 실패하는 것을 확인한다**

실행: `cd web && npx vitest run lib/proxy.test.ts`
기대: `proxyToApi is not a function`으로 실패

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/proxy.ts`에서 기존 `proxyNearby`의 본문을 `proxyToApi`로 옮기고, 경로만 인자로 뺀다. **오류 처리·헤더·캐시 금지 규칙과 그 주석은 한 글자도 바꾸지 않는다** — 그 규칙들은 장소 검색에도 똑같이 적용된다.

```typescript
/**
 * 어느 경로든 Go 서버로 넘기고 그 응답을 그대로 돌려준다.
 *
 * @param path Go 서버의 경로. "/api/v1/nearby" 또는 "/api/v1/places".
 * @param search 브라우저가 보낸 질의 문자열. 손대지 않고 넘긴다.
 * ... (나머지 인자 설명은 기존 proxyNearby의 것을 그대로 옮긴다)
 */
export async function proxyToApi(
  path: string,
  search: string,
  apiOrigin: string,
  internalKey: string,
  fetcher: Fetcher,
): Promise<Response> {
  // 기존 proxyNearby의 본문을 그대로 옮기되, 부르는 주소만 바꾼다.
  //   upstream = await fetcher(`${apiOrigin}${path}${search}`, { headers });
}

/**
 * 음식점 조회를 넘긴다. proxyToApi의 얇은 껍데기로 남긴다.
 *
 * 이 이름을 지우지 않는 이유: 부르는 자리(app/api/v1/nearby/route.ts)가 무엇을
 * 넘기는지 이름으로 드러나고, 기존 시험이 이 계약을 그대로 지키고 있다.
 */
export async function proxyNearby(
  search: string,
  apiOrigin: string,
  internalKey: string,
  fetcher: Fetcher,
): Promise<Response> {
  return proxyToApi("/api/v1/nearby", search, apiOrigin, internalKey, fetcher);
}
```

`web/app/api/v1/places/route.ts`를 새로 만든다. 기존 `nearby/route.ts`를 그대로 본떠서 판단을 하나도 두지 않는다.

```typescript
import { proxyToApi } from "@/lib/proxy";

/**
 * 브라우저의 장소 검색 요청을 Go 서버로 넘긴다.
 *
 * 이 파일은 껍데기다 — 환경변수를 읽어 넘기는 것 말고는 아무 판단도 하지 않는다.
 * 화면 시험은 브라우저 없이 node에서 돌아 app/ 아래를 실행하지 못하므로,
 * 여기에 판단을 두면 어떤 시험도 그것을 지키지 못한다(규칙과 시험은 lib/proxy.ts에 있다).
 *
 * 이 경로에 export const dynamic을 두지 않는 이유는 nearby/route.ts와 같다 —
 * 라우트 핸들러는 기본적으로 캐시되지 않는다.
 */
export async function GET(request: Request) {
  // 브라우저가 보낸 질의 문자열을 그대로 넘긴다. 값 검사는 Go 서버가 한다 —
  // 여기서 한 번 더 검사하면 두 곳의 규칙이 조용히 어긋난다.
  const search = new URL(request.url).search;

  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";
  const internalKey = process.env.INTERNAL_API_KEY ?? "";

  return proxyToApi("/api/v1/places", search, apiOrigin, internalKey, fetch);
}
```

- [ ] **단계 4: 시험이 통과하는 것을 확인한다**

실행: `cd web && npx vitest run lib/proxy.test.ts`
기대: 기존 시험과 새 시험이 모두 PASS

- [ ] **단계 5: 방어를 꺼서 시험이 실제로 일하는지 확인한다**

1. `proxyToApi`에서 `path` 대신 `/api/v1/nearby`를 하드코딩한다 → 새로 쓴 "받은 경로와 질의 문자열을 그대로 붙여 부른다"가 실패해야 한다
2. `responseHeaders.set("Cache-Control", "no-store")`를 지운다 → 캐시 금지 시험이 실패해야 한다

- [ ] **단계 6: 검증하고 커밋한다**

```bash
cd web && npm test && npx tsc --noEmit
cd .. && git add web/lib/proxy.ts web/lib/proxy.test.ts web/app/api/v1/places/route.ts
git commit -m "feat(web): 장소 검색을 조회 서버로 넘기는 경로를 연다"
```

---

## Task 4: 조회 기준점을 다루는 모듈을 만든다

**파일**
- 신규: `web/lib/anchor.ts`
- 신규: `web/lib/anchor.test.ts`

**주고받는 것**
- 쓰는 것: `web/lib/visits.ts`의 `Store` 타입(저장소를 밖에서 받는 같은 방식)
- 내놓는 것: `Anchor` 타입, `KEYWORD_KEY`, `readKeyword(store)`, `writeKeyword(store, keyword)`, `forgetKeyword(store)`, `anchorLabel(anchor)`

**참조할 스킬·에이전트:** `vercel-react-best-practices`의 `client-localstorage-schema`(저장소 열쇠에 판 번호를 붙이는 규칙)

**완료조건:** `cd web && npx vitest run lib/anchor.test.ts`가 통과하고, 저장되는 값에 좌표와 장소 이름이 들어가지 않는 것이 시험으로 막혀 있다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

```typescript
import { describe, expect, it } from "vitest";
import {
  anchorLabel, forgetKeyword, KEYWORD_KEY, readKeyword, writeKeyword, type Anchor,
} from "./anchor";
import type { Store } from "./visits";

function fakeStore(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

function throwingStore(): Store {
  return {
    getItem: () => { throw new DOMException("거부", "SecurityError"); },
    setItem: () => { throw new DOMException("초과", "QuotaExceededError"); },
    removeItem: () => { throw new DOMException("거부", "SecurityError"); },
  };
}

describe("검색어 저장", () => {
  it("저장한 글자를 그대로 읽는다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    expect(readKeyword(store)).toBe("경주");
  });

  it("저장된 것이 없으면 null이다", () => {
    expect(readKeyword(fakeStore())).toBeNull();
  });

  it("가장 마지막 것 하나만 남는다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    writeKeyword(store, "강남역");
    expect(readKeyword(store)).toBe("강남역");
  });

  it("앞뒤 공백을 떼고 저장한다", () => {
    const store = fakeStore();
    writeKeyword(store, "  경주  ");
    expect(readKeyword(store)).toBe("경주");
  });

  it("빈 글자는 저장하지 않는다", () => {
    const store = fakeStore();
    writeKeyword(store, "   ");
    expect(readKeyword(store)).toBeNull();
    expect(store.data[KEYWORD_KEY]).toBeUndefined();
  });

  it("지우면 없어진다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    forgetKeyword(store);
    expect(readKeyword(store)).toBeNull();
  });

  it("저장소가 null이어도 터지지 않는다", () => {
    expect(readKeyword(null)).toBeNull();
    expect(() => writeKeyword(null, "경주")).not.toThrow();
    expect(() => forgetKeyword(null)).not.toThrow();
  });

  it("저장소가 예외를 던져도 터지지 않는다", () => {
    const store = throwingStore();
    expect(readKeyword(store)).toBeNull();
    expect(() => writeKeyword(store, "경주")).not.toThrow();
    expect(() => forgetKeyword(store)).not.toThrow();
  });

  // 문자열이 아닌 값이 들어 있으면 없는 것으로 본다. 사람이 손으로 고쳤거나
  // 다른 판본이 남긴 값일 텐데, 그대로 화면에 그리면 단추 글자가 깨진다.
  it("문자열이 아닌 값은 없는 것으로 본다", () => {
    for (const bad of ['{"a":1}', "123", "true", "null", "[]", "깨진json{"]) {
      expect(readKeyword(fakeStore({ [KEYWORD_KEY]: bad }))).toBeNull();
    }
  });

  // **이 시험이 저장 경계를 지키는 유일한 방어다.** 카카오가 저장을 허용한 것은
  // 사용자가 직접 정한 장소의 장소식별값과 상호까지이고 좌표는 그 문구에 없다.
  // 나중에 "단추 한 번으로 바로 조회되게" 하려고 좌표를 얹고 싶어지면,
  // 타입 검사는 그것을 막지 못한다.
  it("저장된 값에 좌표도 장소 이름도 들어가지 않는다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    const raw = store.data[KEYWORD_KEY];
    expect(raw).toBe(JSON.stringify("경주"));
    expect(raw).not.toMatch(/lat|lng|\d+\.\d+/);
  });
});

describe("기준 위치 문구", () => {
  it("브라우저 위치일 때", () => {
    expect(anchorLabel({ kind: "here" })).toBe("지금 있는 곳");
  });

  it("옮긴 위치일 때는 장소 이름이 들어간다", () => {
    const anchor: Anchor = { kind: "spot", name: "경주 황리단길", lat: 35.83, lng: 129.21 };
    expect(anchorLabel(anchor)).toBe("경주 황리단길 주변");
  });

  // 긴 이름을 그대로 두면 좁은 화면에서 줄이 넘친다. 설계 문서 6절의
  // 미확인 전제 6번이 이것이었다. 잘라내는 길이는 한글 기준으로 정한다.
  it("아주 긴 이름은 줄여서 보여준다", () => {
    const anchor: Anchor = {
      kind: "spot", name: "해운대블루라인파크 청사포정거장", lat: 35.1, lng: 129.2,
    };
    const label = anchorLabel(anchor);
    expect(label.length).toBeLessThanOrEqual(20);
    expect(label).toContain("…");
    expect(label.endsWith("주변")).toBe(true);
  });
});
```

- [ ] **단계 2: 시험이 실패하는 것을 확인한다**

실행: `cd web && npx vitest run lib/anchor.test.ts`
기대: `Failed to resolve import "./anchor"`

- [ ] **단계 3: 최소 구현을 쓴다**

```typescript
/**
 * 음식점을 어디를 기준으로 찾을 것인가.
 *
 * 이름을 `origin`이 아니라 `anchor`로 둔 이유: 이 저장소에는 이미 `API_ORIGIN`이라는
 * 환경변수가 있어(web/app/api/v1/nearby/route.ts) 읽는 사람이 두 개념을 헷갈린다.
 */

import type { Store } from "./visits";

export type Anchor =
  | { kind: "here" }
  | { kind: "spot"; name: string; lat: number; lng: number };

/**
 * 사용자가 마지막으로 친 검색어를 담는 열쇠.
 *
 * **여기 담기는 것은 사용자가 친 글자 하나뿐이다.** 카카오가 돌려준 장소 이름도
 * 좌표도 담지 않는다. 카카오는 조회 결과의 저장을 금지하고, 담당자가 밝힌 예외는
 * "사용자가 직접 고른 장소의 장소식별값과 상호"까지여서 좌표는 그 문구에 없다
 * (설계 문서 4-5절). 사용자가 친 글자는 카카오 응답이 아니라 사용자가 만든
 * 입력이므로 이 경계와 무관하고, 회피 스위치(random-choice.avoid.v1)와 같은 성격이다.
 *
 * 판 번호(v1)를 붙이는 이유: 담는 모양이 바뀌면 옛 값을 읽다 깨지는 대신
 * 새 열쇠로 옮겨 갈 수 있다. 이 저장소의 다른 두 열쇠와 같은 규칙이다.
 */
export const KEYWORD_KEY = "random-choice.keyword.v1";

/**
 * 기준 위치 줄에 쓸 이름의 최대 길이. 넘으면 줄이고 말줄임표를 붙인다.
 *
 * 12인 근거: 줄 전체가 `<이름> 주변에서 찾았어요`가 되고 옆에 `바꾸기` 단추가
 * 붙는다. 실제로 긴 이름인 `해운대블루라인파크 청사포정거장`(16자)을 그대로 두면
 * 줄이 19자가 되어 좁은 화면에서 단추를 밀어낸다. 12자로 자르면 16자가 된다.
 * 이 수를 늘리려면 가장 좁은 화면에서 실제로 재 본 뒤에 바꾼다.
 */
const MAX_NAME = 12;

/**
 * 마지막으로 친 검색어를 읽는다. 없거나 읽지 못하면 null이다.
 *
 * 문자열이 아닌 값을 전부 null로 보는 이유: 그대로 화면에 그리면
 * `[object Object]로 다시 찾기` 같은 단추가 생긴다.
 */
export function readKeyword(store: Store | null): string | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(KEYWORD_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 검색어를 저장한다. 앞뒤 공백을 떼고, 비면 아무것도 하지 않는다.
 *
 * 빈 값을 저장하지 않는 이유: 저장하면 시작 화면에 글자 없는 단추가 하나 생긴다.
 */
export function writeKeyword(store: Store | null, keyword: string): void {
  if (store === null) return;
  const trimmed = keyword.trim();
  if (trimmed === "") return;
  try {
    store.setItem(KEYWORD_KEY, JSON.stringify(trimmed));
  } catch {
    // 용량이 찼거나 저장이 막혔다. 사용자가 할 수 있는 일이 없으므로 조용히 넘어간다.
    // 이번 세션에서는 화면이 들고 있는 값이 맞으므로 그대로 쓴다.
  }
}

export function forgetKeyword(store: Store | null): void {
  if (store === null) return;
  try {
    store.removeItem(KEYWORD_KEY);
  } catch {
    // 지우지 못했다. 사용자가 할 수 있는 일이 없다.
  }
}

/**
 * 후보·결과 화면 위쪽에 그릴 기준 위치 문구.
 *
 * 이 판단을 화면 조각이 아니라 여기 두는 이유: 화면 시험은 브라우저 없이 돌아
 * .tsx 파일에 닿지 못한다. 줄이는 규칙을 컴포넌트에 두면 아무 시험도 지키지 못한다.
 */
export function anchorLabel(anchor: Anchor): string {
  if (anchor.kind === "here") {
    return "지금 있는 곳";
  }
  const name =
    anchor.name.length > MAX_NAME ? `${anchor.name.slice(0, MAX_NAME)}…` : anchor.name;
  return `${name} 주변`;
}
```

- [ ] **단계 4: 시험이 통과하는 것을 확인한다**

실행: `cd web && npx vitest run lib/anchor.test.ts`
기대: 모두 PASS

- [ ] **단계 5: 방어를 꺼서 시험이 실제로 일하는지 확인한다**

1. `readKeyword`의 `typeof parsed === "string"` 검사를 지운다 → "문자열이 아닌 값은 없는 것으로 본다"가 실패해야 한다
2. `writeKeyword`의 `trim()`을 지운다 → "앞뒤 공백을 떼고 저장한다"가 실패해야 한다
3. `writeKeyword`에서 빈 값 검사를 지운다 → "빈 글자는 저장하지 않는다"가 실패해야 한다
4. `anchorLabel`의 줄이는 규칙을 지운다 → "아주 긴 이름은 줄여서 보여준다"가 실패해야 한다

- [ ] **단계 6: 검증하고 커밋한다**

```bash
cd web && npm test && npx tsc --noEmit && npm run lint
cd .. && git add web/lib/anchor.ts web/lib/anchor.test.ts
git commit -m "feat(web): 조회 기준점 타입과 검색어 저장을 더한다"
```

---

## Task 5: 검색 결과를 안전하게 이어 붙인다

**파일**
- 신규: `web/lib/spots.ts`
- 신규: `web/lib/spots.test.ts`

**주고받는 것**
- 내놓는 것: `Spot` 타입과 `appendSpots(existing: readonly Spot[], incoming: readonly Spot[]): Spot[]`

**참조할 스킬·에이전트:** `vercel-react-best-practices`의 `js-set-map-lookups`(중복 판정에 Set을 쓰는 근거)

**완료조건:** `cd web && npx vitest run lib/spots.test.ts`가 통과한다. 특히 **같은 페이지가 반복해서 와도 목록이 불어나지 않는 것**이 시험으로 막혀 있다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

```typescript
import { describe, expect, it } from "vitest";
import { appendSpots, type Spot } from "./spots";

const spot = (id: string, name = `장소${id}`): Spot => ({
  id, name, address: "주소", category: "", lat: 35.8, lng: 129.2,
});

describe("검색 결과 이어 붙이기", () => {
  it("빈 목록에 이어 붙인다", () => {
    expect(appendSpots([], [spot("a"), spot("b")]).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("뒤에 붙인다. 순서를 바꾸지 않는다", () => {
    const got = appendSpots([spot("a")], [spot("b"), spot("c")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * **이 시험이 이 파일의 존재 이유다.**
   *
   * 카카오는 마지막 페이지를 넘겨 요청받으면 오류를 주지 않고 마지막 페이지를
   * 그대로 다시 준다(2026-09-20 실측). 중복을 거르지 않으면 `더 보기`를 누를 때마다
   * 같은 장소 열다섯 곳이 목록에 계속 쌓인다.
   */
  it("이미 있는 장소는 다시 붙이지 않는다", () => {
    const first = [spot("a"), spot("b")];
    const got = appendSpots(first, [spot("a"), spot("b")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("겹치는 것만 빼고 새것은 붙인다", () => {
    const got = appendSpots([spot("a"), spot("b")], [spot("b"), spot("c")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * 카카오는 식별자가 빈 장소도 준다. 빈 문자열을 열쇠로 쓰면 그런 장소가
   * 하나만 남고 나머지가 모두 사라진다. 음식점 조회도 같은 규칙을 쓴다
   * (api/internal/kakao/client.go의 SearchRestaurants).
   */
  it("식별자가 빈 장소는 중복 판정에서 빼고 그대로 살린다", () => {
    const nameless1 = { ...spot(""), name: "이름없음1" };
    const nameless2 = { ...spot(""), name: "이름없음2" };
    const got = appendSpots([nameless1], [nameless2]);
    expect(got).toHaveLength(2);
    expect(got.map((s) => s.name)).toEqual(["이름없음1", "이름없음2"]);
  });

  it("받은 목록을 바꾸지 않는다", () => {
    const first = [spot("a")];
    appendSpots(first, [spot("b")]);
    expect(first.map((s) => s.id)).toEqual(["a"]);
  });

  it("들어온 목록 안에 중복이 있어도 하나만 남는다", () => {
    const got = appendSpots([], [spot("a"), spot("a"), spot("b")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **단계 2: 시험이 실패하는 것을 확인한다**

실행: `cd web && npx vitest run lib/spots.test.ts`
기대: `Failed to resolve import "./spots"`

- [ ] **단계 3: 최소 구현을 쓴다**

```typescript
/**
 * 장소 검색 결과를 다루는 순수 함수.
 *
 * 이 판단을 화면 조각이 아니라 여기 두는 이유: 화면 시험은 브라우저 없이 node에서
 * 돌아 .tsx 파일에 닿지 못한다(web/vitest.config.mts). 컴포넌트 안에 두면
 * 아무 시험도 이것을 지키지 못한다.
 */

/** 음식점을 찾을 기준으로 삼을 장소 한 곳. 서버의 spotDTO와 같은 모양이다. */
export type Spot = {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
};

/**
 * `더 보기`로 받은 결과를 지금 목록 뒤에 이어 붙인다. 이미 있는 장소는 빼고 붙인다.
 *
 * **중복을 거르는 것이 이 함수의 전부이고, 그것이 꼭 필요한 이유가 있다.**
 * 카카오는 마지막 페이지를 넘겨 요청받으면 오류를 주지 않고 마지막 페이지를 그대로
 * 다시 준다(2026-09-20 실측: 15개씩 받을 때 4페이지가 3페이지와 같았다).
 * 화면이 서버가 준 끝 표시(isEnd)를 보고 멈추는 것이 1차 방어이고, 이 함수가 2차다.
 * 둘 다 두는 이유는 끝 표시를 읽는 자리가 화면 조각이라 시험이 닿지 못하기 때문이다.
 *
 * 식별자가 빈 장소는 중복 판정에서 뺀다. 빈 문자열을 열쇠로 쓰면 그런 장소가
 * 하나만 남고 나머지가 사라진다. 음식점 조회도 같은 규칙을 쓴다.
 */
export function appendSpots(existing: readonly Spot[], incoming: readonly Spot[]): Spot[] {
  const seen = new Set(existing.map((s) => s.id).filter((id) => id !== ""));
  const merged = [...existing];
  for (const spot of incoming) {
    if (spot.id !== "") {
      if (seen.has(spot.id)) continue;
      seen.add(spot.id);
    }
    merged.push(spot);
  }
  return merged;
}
```

- [ ] **단계 4: 시험이 통과하는 것을 확인한다**

실행: `cd web && npx vitest run lib/spots.test.ts`
기대: 모두 PASS

- [ ] **단계 5: 방어를 꺼서 시험이 실제로 일하는지 확인한다**

1. `seen.has(spot.id)` 검사를 지운다 → "이미 있는 장소는 다시 붙이지 않는다"가 실패해야 한다
2. `.filter((id) => id !== "")`와 `spot.id !== ""` 검사를 지운다 → "식별자가 빈 장소는…"이 실패해야 한다
3. `[...existing]` 대신 `existing as Spot[]`를 쓴다 → "받은 목록을 바꾸지 않는다"가 실패해야 한다

- [ ] **단계 6: 검증하고 커밋한다**

```bash
cd web && npm test && npx tsc --noEmit && npm run lint
cd .. && git add web/lib/spots.ts web/lib/spots.test.ts
git commit -m "feat(web): 검색 결과를 중복 없이 이어 붙이는 규칙을 더한다"
```

---

## Task 6: 브라우저가 장소 검색을 부른다

**파일**
- 수정: `web/lib/api.ts`
- 수정: `web/lib/api.test.ts`
- 수정: `web/lib/errors.ts`
- 수정: `web/lib/errors.test.ts`

**주고받는 것**
- 쓰는 것: Task 3의 `/api/v1/places` 경로, Task 5의 `Spot` 타입
- 내놓는 것: `fetchSpots(query: string, page: number): Promise<{ spots: Spot[]; isEnd: boolean }>`. 실패하면 기존 `NearbyError`를 던진다

**참조할 스킬·에이전트:** 없음

**완료조건:** `cd web && npx vitest run lib/api.test.ts lib/errors.test.ts`가 통과한다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/api.test.ts`에 더한다. 기존 시험의 `fetch` 가짜 패턴을 그대로 따른다.

```typescript
describe("장소 검색", () => {
  it("검색어와 쪽 번호를 붙여 부른다", async () => {
    let calledUrl = "";
    vi.stubGlobal("fetch", async (url: string) => {
      calledUrl = url;
      return new Response('{"spots":[],"isEnd":true}', { status: 200 });
    });
    await fetchSpots("경주", 2);
    expect(calledUrl).toBe("/api/v1/places?query=%EA%B2%BD%EC%A3%BC&page=2");
  });

  it("장소 목록과 끝 표시를 돌려준다", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        '{"spots":[{"id":"s1","name":"황리단길","address":"경북","category":"관광명소","lat":35.8,"lng":129.2}],"isEnd":false}',
        { status: 200 },
      ),
    );
    const got = await fetchSpots("경주", 1);
    expect(got.spots).toHaveLength(1);
    expect(got.spots[0].name).toBe("황리단길");
    expect(got.isEnd).toBe(false);
  });

  // 모양을 확인하지 않고 단정하면 계약이 어긋난 순간이 아니라 한참 뒤
  // 화면이 그 값을 쓰는 자리에서 조용히 망가진다. fetchNearby와 같은 규칙이다.
  it("응답 모양이 다르면 malformed_response로 던진다", async () => {
    for (const bad of [
      '{"spots":"목록아님","isEnd":true}',
      '{"spots":[{"id":"s1"}],"isEnd":true}',
      '{"spots":[],"isEnd":"참"}',
      '{"isEnd":true}',
      "[]",
    ]) {
      vi.stubGlobal("fetch", async () => new Response(bad, { status: 200 }));
      await expect(fetchSpots("경주", 1)).rejects.toMatchObject({ code: "malformed_response" });
    }
  });

  it("서버가 준 오류 코드를 그대로 전한다", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response('{"error":"invalid_query","message":"비어 있습니다."}', { status: 400 }),
    );
    await expect(fetchSpots("", 1)).rejects.toMatchObject({ code: "invalid_query", status: 400 });
  });

  it("서버에 닿지 못하면 network_error로 던진다", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    await expect(fetchSpots("경주", 1)).rejects.toMatchObject({ code: "network_error" });
  });
});
```

`web/lib/errors.test.ts`는 Go 소스에서 오류 코드를 뽑아 표와 대조하므로 새 코드 `invalid_query`가 자동으로 걸린다. 그 시험이 통과하려면 `errors.ts`에 문구가 있어야 한다. 별도 시험을 쓸 필요는 없지만, 아래를 확인한다.

```bash
cd web && grep -n "handler.go\|KNOWN_ERROR_CODES" lib/errors.test.ts
```

- [ ] **단계 2: 시험이 실패하는 것을 확인한다**

실행: `cd web && npx vitest run lib/api.test.ts lib/errors.test.ts`
기대: `fetchSpots is not a function`, 그리고 `errors.test.ts`가 `invalid_query`가 표에 없다고 실패

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/api.ts`에 더한다. `fetchNearby`의 구조를 그대로 따른다 — 시간 상한, 오류 코드 처리, 응답 모양 확인.

```typescript
import type { Spot } from "./spots";

export type SpotsResult = { spots: Spot[]; isEnd: boolean };

function isSpot(value: unknown): value is Spot {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Spot;
  return (
    // id는 빌 수 있다. 카카오가 식별자 없는 장소도 주고, lib/spots.ts가
    // 그런 장소를 중복 판정에서 빼면서 그대로 살리기 때문이다.
    typeof c.id === "string" &&
    // name이 비면 글자 없는 줄이 목록에 뜬다. 누를 수는 있는데 무엇을 고르는지
    // 보이지 않으므로 오류 없이 망가진 화면이 된다.
    typeof c.name === "string" &&
    c.name.length > 0 &&
    typeof c.address === "string" &&
    typeof c.category === "string" &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng)
  );
}

function isSpotsResult(value: unknown): value is SpotsResult {
  if (typeof value !== "object" || value === null) return false;
  const c = value as { spots?: unknown; isEnd?: unknown };
  return Array.isArray(c.spots) && c.spots.every(isSpot) && typeof c.isEnd === "boolean";
}

/**
 * 이름으로 장소를 찾는다. 한 번에 한 쪽씩 받는다.
 *
 * 부르는 쪽은 돌려받은 isEnd를 보고 멈춰야 한다. 카카오는 마지막 쪽을 넘겨
 * 요청받아도 오류 대신 마지막 쪽을 그대로 다시 주기 때문이다.
 */
export async function fetchSpots(query: string, page: number): Promise<SpotsResult> {
  // 아래 본문은 fetchNearby와 같은 구조로 쓴다. 상한 해제를 함수 전체의 finally에
  // 두는 것, 오류 본문을 읽다 상한에 걸리는 경우를 따로 다루는 것, 모양을 확인한
  // 뒤에만 돌려주는 것까지 그대로다. 그 각각의 이유는 fetchNearby의 주석에 있다.
  //
  // 부르는 주소:
  //   `/api/v1/places?query=${encodeURIComponent(query)}&page=${page}`
  // 검색어를 encodeURIComponent로 감싸는 이유: 사용자가 & 나 = 를 치면
  // 그대로 붙였을 때 질의 문자열이 깨져 엉뚱한 값이 서버에 간다.
  //
  // 모양 확인은 isSpotsResult를 쓴다.
}
```

`web/lib/errors.ts`의 `ERROR_TEXT`에 더한다.

```typescript
  invalid_query: {
    title: "찾을 장소 이름이 올바르지 않아요",
    description: "장소 이름을 적은 뒤 다시 찾아 주세요.",
    retryable: true,
  },
```

- [ ] **단계 4: 시험이 통과하는 것을 확인한다**

실행: `cd web && npx vitest run lib/api.test.ts lib/errors.test.ts`
기대: 모두 PASS

- [ ] **단계 5: 방어를 꺼서 시험이 실제로 일하는지 확인한다**

1. `isSpotsResult`를 언제나 `true`를 돌려주게 바꾼다 → "응답 모양이 다르면…"이 실패해야 한다
2. `encodeURIComponent`를 지운다 → "검색어와 쪽 번호를 붙여 부른다"가 실패해야 한다
3. `errors.ts`에서 `invalid_query` 항목을 지운다 → `errors.test.ts`가 실패해야 한다

- [ ] **단계 6: 검증하고 커밋한다**

```bash
cd web && npm test && npx tsc --noEmit && npm run lint
cd .. && git add web/lib/api.ts web/lib/api.test.ts web/lib/errors.ts
git commit -m "feat(web): 브라우저에서 장소 검색을 부르는 함수를 더한다"
```

---

## Task 7: 위치 검색 화면을 만든다

**파일**
- 신규: `web/components/SearchScreen.tsx`

**주고받는 것**
- 쓰는 것: Task 5의 `Spot`·`appendSpots`, Task 6의 `fetchSpots`, 기존 `lib/errors.ts`의 `errorNotice`
- 내놓는 것: `<SearchScreen initialKeyword onPick onBack />`. `onPick(spot: Spot, keyword: string)`은 고른 장소와 그때 쓴 검색어를 함께 넘긴다(검색어는 저장에, 장소는 조회에 쓴다)

**참조할 스킬·에이전트:** `vercel-react-best-practices`, `vercel-composition-patterns`. 구현 뒤 `web-design-guidelines`로 접근성을 확인한다.

**완료조건:** `cd web && npm run build && npx tsc --noEmit && npm run lint`가 종료코드 0. 화면 조각에는 시험이 붙지 않으므로 **판단은 한 줄도 두지 않는다** — 이어 붙이기는 `lib/spots.ts`, 문구는 `lib/errors.ts`가 갖는다.

- [ ] **단계 1: 화면을 만든다**

이 저장소의 기존 화면 조각과 같은 규칙을 지킨다.

- 조회 중에는 `disabled`가 아니라 `aria-disabled`로 막는다. `disabled`는 방금 누른 단추의 포커스를 떨어뜨려, 키보드나 화면 낭독기를 쓰는 사람이 자기 위치를 잃는다. 실제로 눌리지 않게 하는 것은 `onClick`의 삼항 연산자가 맡는다.
- 상태 변화는 `role="status"` `aria-live="polite"`를 가진 숨은 영역(`sr-only`)으로 알린다.
- `더 보기`는 화면을 바꾸는 것이 아니므로 포커스를 그 단추에 그대로 둔다.
- 목록의 `key`는 `id`를 쓰되, 카카오가 빈 식별자도 주므로 **빈 경우에는 목록 위치를 섞어 쓴다**(`spot.id || `i-${index}``). 빈 문자열을 그대로 key로 쓰면 그런 장소가 둘 이상일 때 React가 엉뚱한 줄을 재사용한다.

```tsx
"use client";

import { useState } from "react";
import { fetchSpots, NearbyError } from "@/lib/api";
import { errorNotice } from "@/lib/errors";
import { appendSpots, type Spot } from "@/lib/spots";

type Props = {
  /** 시작 화면의 `~로 다시 찾기`로 들어왔을 때 입력창에 채워 둘 글자. */
  initialKeyword: string;
  onPick: (spot: Spot, keyword: string) => void;
  onBack: () => void;
};

export default function SearchScreen({ initialKeyword, onPick, onBack }: Props) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [page, setPage] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  // 제목과 설명을 함께 들고 있는다. 제목만 남기면 "서버에 연결하지 못했어요"까지만
  // 보이고 "인터넷 연결을 확인한 뒤 다시 시도해 주세요"라는 다음 행동 안내가 사라진다.
  // lib/errors.ts가 그 둘을 나눠 두는 까닭이 바로 그것이다.
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  // 방금 어떤 글자로 찾았는지. 입력창을 고치는 도중에도 목록의 출처가 바뀌지
  // 않아야 하므로 keyword와 따로 둔다.
  const [searched, setSearched] = useState("");

  async function search(nextPage: number) {
    const trimmed = keyword.trim();
    if (trimmed === "" || loading) return;
    setLoading(true);
    setError(null);
    try {
      const got = await fetchSpots(trimmed, nextPage);
      // 이어 붙이는 규칙은 lib/spots.ts가 갖는다. 여기서 직접 합치면
      // 카카오가 마지막 쪽을 되풀이해 줄 때 같은 장소가 끝없이 쌓이는 것을
      // 아무 시험도 막지 못한다.
      setSpots((prev) => (nextPage === 1 ? got.spots : appendSpots(prev, got.spots)));
      setIsEnd(got.isEnd);
      setPage(nextPage);
      setSearched(trimmed);
    } catch (cause) {
      const code = cause instanceof NearbyError ? cause.code : "unexpected";
      const message = cause instanceof NearbyError ? cause.message : "";
      if (!(cause instanceof NearbyError)) {
        console.error("[SearchScreen] 예상하지 못한 오류", cause);
      }
      const notice = errorNotice(code, message);
      setError({ title: notice.title, description: notice.description });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rise flex w-full grow flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="btn self-start text-muted underline underline-offset-4"
      >
        돌아가기
      </button>

      <h2 className="text-2xl font-bold tracking-tight text-balance">어디에서 찾을까요?</h2>

      {/*
        form으로 감싸는 이유: 입력창에서 Enter를 눌렀을 때도 찾아지게 하기 위해서다.
        단추만 두면 손가락으로 쓰는 사람은 괜찮지만 키보드를 쓰는 사람은
        입력창을 떠나 단추로 옮겨 가야 한다.
        onSubmit에서 preventDefault를 하지 않으면 페이지가 통째로 새로 뜬다.
      */}
      <form
        className="flex w-full gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search(1);
        }}
      >
        {/* 눈에 보이는 이름표가 없으면 화면 낭독기 사용자는 이 칸이 무엇을 받는지 모른다. */}
        <label htmlFor="spot-query" className="sr-only">
          찾을 장소 이름
        </label>
        <input
          id="spot-query"
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="경주, 강남역, 제주시 애월읍…"
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2"
        />
        <button
          type="submit"
          aria-disabled={loading || keyword.trim() === ""}
          className="btn btn-primary shrink-0"
        >
          {loading ? "찾는 중…" : "찾기"}
        </button>
      </form>

      {error !== null ? (
        <div className="w-full rounded-xl border border-line p-3">
          <p className="font-semibold">{error.title}</p>
          <p className="text-sm text-muted">{error.description}</p>
        </div>
      ) : null}

      <ul className="flex w-full flex-col gap-2">
        {spots.map((spot, index) => (
          /*
            key에 목록 위치를 섞는 이유: 카카오는 식별자가 빈 장소도 준다. 빈 문자열을
            그대로 key로 쓰면 그런 장소가 둘 이상일 때 React가 엉뚱한 줄을 재사용한다.
            lib/spots.ts가 빈 식별자를 중복 판정에서 빼고 그대로 살리므로 실제로 둘 이상 올 수 있다.
          */
          <li key={spot.id !== "" ? spot.id : `i-${index}`}>
            <button
              type="button"
              onClick={() => onPick(spot, searched)}
              className="row flex w-full items-center justify-between gap-3 rounded-xl border border-line p-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {spot.name}
                  {spot.category !== "" ? (
                    <span className="ml-2 text-sm font-normal text-muted">{spot.category}</span>
                  ) : null}
                </span>
                <span className="block truncate text-sm text-muted">{spot.address}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/*
        한 번이라도 찾았고 결과가 없을 때만 알린다. keyword가 아니라 searched로
        판단하는 이유: keyword는 사용자가 타자를 칠 때마다 바뀌므로, 그것으로 판단하면
        첫 글자를 치는 순간 "찾지 못했어요"가 뜬다.
      */}
      {searched !== "" && spots.length === 0 && !loading && error === null ? (
        <p className="text-muted">그런 이름의 장소를 찾지 못했어요. 다른 말로 찾아보세요.</p>
      ) : null}

      {spots.length > 0 && !isEnd ? (
        <button
          type="button"
          onClick={loading ? undefined : () => void search(page + 1)}
          aria-disabled={loading}
          className="btn btn-quiet w-full"
        >
          더 보기
        </button>
      ) : null}

      {/*
        끝에 닿았을 때 빠져나갈 길을 알린다. 카카오는 한 검색어에 많아야 45곳까지만
        내주므로(검색어에 따라 그보다 적다), 원하는 곳이 그 안에 없으면 사용자가
        검색어를 좁히는 것 말고는 방법이 없다. 그 사실을 알리지 않으면 사용자는
        `더 보기`가 사라진 것을 고장으로 받아들인다.
      */}
      {spots.length > 0 && isEnd ? (
        <p className="text-sm text-muted">
          여기까지가 전부입니다. 못 찾으셨다면 `경주 보문단지`처럼 더 좁혀서 찾아보세요.
        </p>
      ) : null}

      {/*
        눈에는 보이지 않고 화면 낭독기만 읽는 영역. 목록이 늘어난 것을 소리로 알린다.
        `더 보기`는 화면을 바꾸는 것이 아니라 포커스가 그 단추에 그대로 있으므로,
        이 영역이 없으면 무엇이 달라졌는지 들을 방법이 없다.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading
          ? "장소를 찾고 있습니다."
          : spots.length > 0
            ? `${spots.length}곳을 찾았습니다.`
            : ""}
      </p>
    </section>
  );
}
```

`더 보기`를 눌러도 포커스를 옮기지 않는다. 이 저장소의 `다른 가게 보기`와 같은 규칙이다 — 화면이 바뀌는 것이 아니라 목록이 늘어나는 것이므로, 포커스를 빼앗으면 키보드를 쓰는 사람이 자기 위치를 잃는다.

- [ ] **단계 2: 빌드와 타입·린트를 확인한다**

실행: `cd web && npm run build && npx tsc --noEmit && npm run lint`
기대: 모두 종료코드 0

- [ ] **단계 3: 판단이 화면 조각에 남지 않았는지 확인한다**

이 저장소에서 가장 자주 나는 사고다. 아래를 눈으로 확인한다.

- 중복 제거를 `SearchScreen.tsx` 안에서 하고 있지 않은가 → `appendSpots`가 해야 한다
- 오류 문구를 이 파일에서 만들고 있지 않은가 → `errorNotice`가 해야 한다
- `isEnd`를 무시하고 페이지를 올리고 있지 않은가

- [ ] **단계 4: 커밋한다**

```bash
cd .. && git add web/components/SearchScreen.tsx
git commit -m "feat(web): 위치 검색 화면을 더한다"
```

---

## Task 8: 시작 화면을 고치고 흐름을 이어 맞춘다

시작 화면의 속성을 바꾸면 그것을 부르는 `app/page.tsx`가 그 자리에서 깨진다. 두 파일을 한 작업으로 묶는 이유가 그것이다 — 따로 두면 앞 작업이 타입 검사를 통과하지 못한 채로 끝난다.

**파일**
- 수정: `web/components/StartScreen.tsx`
- 수정: `web/app/page.tsx`

**주고받는 것**
- 쓰는 것: Task 4의 `Anchor`·`readKeyword`·`writeKeyword`, Task 5의 `Spot`, Task 7의 `SearchScreen`
- 내놓는 것: `<StartScreen lastKeyword onResume onStartHere onStartElsewhere loading onShowVisits />`. `onResume`은 `lastKeyword`가 빈 문자열이 아닐 때만 그려진다

**참조할 스킬·에이전트:** `vercel-react-best-practices`(특히 `rerender-derived-state-no-effect`·`rendering-conditional-render`), `vercel-composition-patterns`

**완료조건:** `just check`가 종료코드 0. 그리고 **빈 결과 화면의 `다시 찾아보기`가 옮긴 위치의 좌표로 다시 찾는 것**이 코드에서 확인된다.

- [ ] **단계 1: 시작 화면의 속성을 바꾼다**

```typescript
type Props = {
  /** 마지막으로 찾았던 글자. 빈 문자열이면 `~로 다시 찾기` 단추를 그리지 않는다. */
  lastKeyword: string;
  onResume: () => void;
  onStartHere: () => void;
  onStartElsewhere: () => void;
  loading: boolean;
  onShowVisits: () => void;
};
```

단추 배치는 이렇다. 위쪽 덩어리(제목·설명)와 `my-auto`·`grow` 규칙은 지금 그대로 둔다 — 주요 단추를 화면 아래쪽에 두는 이유가 그 파일 주석에 적혀 있다.

```tsx
      <div className="flex w-full flex-col items-center gap-3">
        {/*
          조건부 그리기에 && 가 아니라 삼항 연산자를 쓴다. `lastKeyword && <button>`은
          빈 문자열일 때 ""를 그대로 그려 넣는다. 지금은 눈에 보이지 않지만, 이 자리가
          수를 담는 값으로 바뀌면 화면에 0이 뜬다.
        */}
        {lastKeyword !== "" ? (
          <button
            type="button"
            onClick={loading ? undefined : onResume}
            aria-disabled={loading}
            className="btn btn-primary w-full"
          >
            {lastKeyword}로 다시 찾기
          </button>
        ) : null}
        <button
          type="button"
          onClick={loading ? undefined : onStartHere}
          aria-disabled={loading}
          aria-busy={loading}
          className={lastKeyword !== "" ? "btn btn-quiet w-full" : "btn btn-primary w-full"}
        >
          {loading ? "주변을 살펴보는 중…" : "지금 있는 곳에서 찾기"}
        </button>
        <button
          type="button"
          onClick={loading ? undefined : onStartElsewhere}
          aria-disabled={loading}
          className="btn btn-quiet w-full"
        >
          다른 곳에서 찾기
        </button>
        <button
          type="button"
          onClick={loading ? undefined : onShowVisits}
          aria-disabled={loading}
          className="btn text-muted underline underline-offset-4"
        >
          최근 기록 보기
        </button>
        <p role="status" aria-live="polite" className="sr-only">
          {loading ? "주변 음식점을 찾고 있습니다." : ""}
        </p>
      </div>
```

세 단추 모두 조회 중에는 `disabled`가 아니라 `aria-disabled`로 막는다. 이유는 이 파일에 이미 적혀 있는 것과 같다 — `disabled`로 만들면 브라우저가 방금 누른 단추의 포커스를 떨어뜨려, 키보드나 화면 낭독기를 쓰는 사람이 자기 위치를 잃는다.

`지금 있는 곳에서 찾기`의 강조를 `lastKeyword`에 따라 바꾸는 이유: 주요 단추(`btn-primary`)가 한 화면에 둘이면 어느 것이 권하는 길인지 알 수 없다. 지난번에 찾은 곳이 있으면 그쪽이 주요 단추가 된다.

- [ ] **단계 2: 화면 상태에 조회 기준점을 더한다**

`web/app/page.tsx`의 `View` 타입에 검색 화면을 더하고, 조회 결과를 담는 갈래에 기준점을 더한다.

```typescript
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "search" }
  | { kind: "candidates"; anchor: Anchor; result: NearbyResult; candidates: Cuisine[] }
  | {
      kind: "result";
      anchor: Anchor;
      /**
       * 후보 화면으로 되돌아갈 때 쓴다(Task 9의 `다른 종류 고르기`).
       * 들고 있지 않으면 조회를 다시 해야 하는데, 그것은 카카오를 최대 123번 더 부르는 일이다.
       */
      result: NearbyResult;
      candidates: Cuisine[];
      cuisine: Cuisine;
      all: Place[];
      pool: Place[];
      places: Place[];
      windowSize: number;
      removed: number;
      released: boolean;
    }
  | { kind: "visits" }
  /**
   * 빈 결과에도 기준점을 들고 있어야 한다. 들고 있지 않으면 `다시 찾아보기`가
   * 사용자가 서 있는 자리로 되돌아가, 경주를 찾던 사람이 갑자기 집 주변을 보게 된다.
   */
  | { kind: "empty"; anchor: Anchor }
  | { kind: "error"; code: string; message: string };
```

- [ ] **단계 3: 조회 함수가 기준점을 받게 고친다**

**이것이 설계 문서 4-7절이 함정이라고 표시한 자리다.** 지금 `start()`는 어떤 경우에도 `getCurrentPosition()`을 먼저 부른다.

```typescript
async function start(anchor: Anchor, radius: number = DEFAULT_RADIUS) {
  setView({ kind: "loading" });

  try {
    // 기준점이 옮긴 자리면 브라우저 위치를 묻지 않는다. 물으면 위치 권한을
    // 거부한 사람이 검색으로 들어온 길에서도 막히고, 허용한 사람도 쓸데없이
    // 기다린다. 이 갈림이 이 기능의 핵심이다.
    const coords =
      anchor.kind === "here"
        ? await getCurrentPosition()
        : { lat: anchor.lat, lng: anchor.lng };
    const result = await fetchNearby(coords.lat, coords.lng, radius);
    const cuisines = distinctById(result.cuisines);
    if (cuisines.length === 0) {
      setView({ kind: "empty", anchor });
      return;
    }
    setView({
      kind: "candidates",
      anchor,
      result,
      candidates: pickDistinct(cuisines, CANDIDATE_COUNT, Math.random),
    });
  } catch (error) {
    // 지금 있는 세 갈래(NearbyError · GeoError · 그 밖)를 그대로 둔다.
    // 콘솔에 원인을 남기는 것도 그대로다.
  }
}
```

- [ ] **단계 4: 기준점을 떨어뜨리지 않고 이어 나른다**

**여기가 가장 놓치기 쉽다.** `setView({ ...view, ... })`로 퍼뜨리는 자리는 기준점이 저절로 따라가지만, 새 객체를 통째로 만드는 자리는 직접 넣어 줘야 한다. 아래 두 함수가 그렇다.

```typescript
function reshuffle() {
  if (view.kind !== "candidates") return;
  const cuisines = distinctById(view.result.cuisines);
  // { ...view }로 퍼뜨리므로 anchor가 따라간다. 고칠 것이 없다.
  setView({ ...view, candidates: pickAvoiding(cuisines, CANDIDATE_COUNT, view.candidates, Math.random) });
}

function choose(cuisine: Cuisine) {
  if (view.kind !== "candidates") return;
  const all = view.result.places.filter((place) => place.cuisineId === cuisine.id);
  const { places: pool, removed, released } = avoidVisited(all, visits, avoidOn);
  setView({
    kind: "result",
    // 여기는 객체를 통째로 새로 만드는 자리다. 이 세 줄을 빠뜨리면
    // 결과 화면에서 기준 위치 줄이 사라지고 후보로 돌아갈 수도 없다.
    anchor: view.anchor,
    result: view.result,
    candidates: view.candidates,
    cuisine,
    all,
    pool,
    places: pickPlaces(pool, PLACE_COUNT, [], Math.random, WINDOW_STEP),
    windowSize: WINDOW_STEP,
    removed,
    released,
  });
}
```

`reshufflePlaces`와 `toggleAvoid`는 `{ ...view }`로 퍼뜨리므로 고칠 것이 없다. 고쳤는지 확인하려면 `grep -n "setView({ kind:" web/app/page.tsx`로 **새 객체를 만드는 자리만** 훑으면 된다.

- [ ] **단계 5: 검색어 상태와 화면 이동을 잇는다**

```typescript
// 마지막으로 찾았던 글자. visits·avoidOn과 같은 이유로 View 밖에 둔다 —
// View는 화면을 옮길 때마다 통째로 갈아 끼우는 값이라, 그 안에 두면
// 화면 하나 지나는 것만으로 설정이 날아간다.
const [lastKeyword, setLastKeyword] = useState("");
```

기록과 회피 설정을 읽는 기존 `useEffect` 안에서 함께 읽는다. 새 `useEffect`를 만들지 않는 이유: 그 파일에 이미 적혀 있듯 이 규칙(`set-state-in-effect`)의 예외를 한 곳으로 모아 두어야 다음 사람이 그 까닭을 한 번만 읽는다.

```typescript
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 까닭은 바로 위에 적었다 */
    setVisits(readVisits(store));
    setAvoidOn(readAvoidOn(store));
    setLastKeyword(readKeyword(store) ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [store]);
```

고른 장소로 조회를 시작하는 함수를 더한다.

```typescript
/**
 * 검색 화면에서 장소를 골랐을 때.
 *
 * **저장하는 것은 사용자가 친 글자뿐이다.** 고른 장소의 이름과 좌표는 이번 조회에만
 * 쓰고 브라우저에 남기지 않는다(설계 문서 4-5절). 그래서 다음에 열었을 때는
 * `경주로 다시 찾기`가 보이고, 누르면 검색 화면으로 가서 한 번 더 고르게 된다.
 */
function pickSpot(spot: Spot, keyword: string) {
  writeKeyword(store, keyword);
  setLastKeyword(keyword);
  start({ kind: "spot", name: spot.name, lat: spot.lat, lng: spot.lng });
}
```

- [ ] **단계 6: 화면 그리기를 잇는다**

```tsx
{(view.kind === "start" || view.kind === "loading") ? (
  <StartScreen
    lastKeyword={lastKeyword}
    onResume={() => setView({ kind: "search" })}
    onStartHere={() => start({ kind: "here" })}
    onStartElsewhere={() => setView({ kind: "search" })}
    loading={view.kind === "loading"}
    onShowVisits={() => setView({ kind: "visits" })}
  />
) : null}

{view.kind === "search" ? (
  <SearchScreen
    initialKeyword={lastKeyword}
    onPick={pickSpot}
    onBack={() => setView({ kind: "start" })}
  />
) : null}
```

빈 결과 화면의 단추도 고친다.

```tsx
{view.kind === "empty" ? (
  <Notice
    title="주변에서 음식점을 찾지 못했어요"
    description="범위를 넓혀서 다시 찾아볼까요?"
    // view.anchor를 넘긴다. 넘기지 않으면 경주를 찾던 사람이 집 주변으로 돌아간다.
    actions={[{ label: "다시 찾아보기", onClick: () => start(view.anchor, WIDER_RADIUS) }]}
  />
) : null}
```

오류 화면의 `다시 시도`는 기준점을 모른다(오류 갈래가 그것을 들고 있지 않다). 시작 화면으로 보내는 대신 **지금 있는 곳으로 다시 시도**하게 둔다 — 오류의 대부분이 위치 확인이나 통신 실패이고, 옮긴 위치에서 난 오류라면 사용자가 시작 화면에서 `~로 다시 찾기`를 누르면 된다.

```tsx
    actions={notice.retryable ? [{ label: "다시 시도", onClick: () => start({ kind: "here" }) }] : []}
```

`screenNameOf`는 고치지 않는다. 그 함수는 `loading`만 `start`로 묶고 나머지는 화면 이름을 그대로 쓰므로, `search`가 늘어도 포커스 이동이 제대로 일어난다.

- [ ] **단계 7: 검증한다**

실행: `just check`
기대: 종료코드 0

- [ ] **단계 8: 커밋한다**

```bash
git add web/components/StartScreen.tsx web/app/page.tsx
git commit -m "feat(web): 시작 화면에서 다른 곳을 골라 찾을 수 있게 한다"
```

---

## Task 9: 어디를 기준으로 찾았는지 알리고, 후보로 돌아갈 수 있게 한다

**파일**
- 수정: `web/components/CandidateScreen.tsx`
- 수정: `web/components/ResultScreen.tsx`
- 수정: `web/app/page.tsx`

**주고받는 것**
- 쓰는 것: Task 4의 `anchorLabel(anchor)`, Task 8이 `View`에 넣어 둔 `anchor`·`result`·`candidates`
- 내놓는 것: 없음

**참조할 스킬·에이전트:** `web-design-guidelines`(구현 뒤 접근성 확인)

**완료조건:** `just check`가 종료코드 0. 후보·결과 화면 위에 기준 위치 줄이 뜨고, 결과 화면에서 후보 화면으로 돌아갈 수 있다.

- [ ] **단계 1: 쓸 수 있는 색 이름을 먼저 확인한다**

아래 코드는 `bg-subtle`을 쓴다. 그 이름이 실제로 있는지 먼저 본다. 없으면 이 파일에 있는 이름 중 "본문보다 한 단계 옅은 바탕"에 해당하는 것을 쓴다. 없는 이름을 쓰면 Tailwind가 조용히 무시해서 줄이 배경 없이 그려진다.

```bash
cd web && grep -n "subtle\|--color\|@theme" app/globals.css | head -25
```

- [ ] **단계 2: 두 화면에 기준 위치 줄을 더한다**

두 화면 모두 속성을 둘 받는다.

```typescript
  /**
   * 무엇을 기준으로 찾았는지 알리는 문구. lib/anchor.ts의 anchorLabel이 만든 것을
   * 그대로 받는다.
   *
   * **이 화면에서 문구를 만들지 않는다.** 긴 이름을 줄이는 규칙이 여기 들어오면
   * 아무 시험도 그것을 지키지 못한다 — 화면 시험은 브라우저 없이 돌아 .tsx 파일에
   * 닿지 못하기 때문이다(web/vitest.config.mts).
   */
  whereLabel: string;
  /** 기준 위치를 바꾸러 간다. */
  onChangeWhere: () => void;
```

줄의 모양은 두 화면이 같다. 각 화면의 `<section>` 맨 위, 지금 있는 내용보다 앞에 둔다.

```tsx
      <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
        {/* truncate로 자르는 것은 눈에 보이는 폭만 다룬다. 글자 수를 줄이는 일은
            lib/anchor.ts가 이미 했고, 이것은 그보다 좁은 화면을 위한 마지막 방어다. */}
        <span className="truncate text-muted">{whereLabel}에서 찾았어요</span>
        <button type="button" onClick={onChangeWhere} className="btn btn-quiet shrink-0 text-sm">
          바꾸기
        </button>
      </div>
```

지도 기호(📍) 대신 글자로 쓰는 이유: 화면 낭독기가 그림 문자를 읽는 방식이 제각각이라, "둥근 압정" 같은 소리가 문장 사이에 끼어든다.

- [ ] **단계 3: 결과 화면에 후보로 돌아가는 단추를 더한다**

`ResultScreen`이 속성을 하나 더 받는다.

```typescript
  /** 후보 고르기 화면으로 돌아간다. 옮긴 위치 그대로 `다시 뽑기`가 이어진다. */
  onBackToCandidates: () => void;
```

단추는 `다른 가게 보기`와 `처음부터 다시` 사이에 둔다.

```tsx
        <button type="button" onClick={onBackToCandidates} className="btn btn-quiet w-full">
          다른 종류 고르기
        </button>
```

글자를 `← 후보 다시 보기`가 아니라 `다른 종류 고르기`로 하는 이유가 둘이다. 이 저장소의 단추가 전부 "무엇을 하는가"로 쓰여 있고(`다른 가게 보기`·`다시 뽑기`·`처음부터 다시`), 화살표 기호는 화면 낭독기가 읽는 방식이 제각각이다.

- [ ] **단계 4: page.tsx에서 이어 맞춘다**

되돌아가는 함수를 더한다. Task 8이 이미 `result` 갈래에 `result`와 `candidates`를 넣어 두었으므로 조회를 다시 하지 않는다.

```typescript
/**
 * 결과 화면에서 후보 화면으로 돌아간다.
 *
 * 조회를 다시 하지 않는 것이 핵심이다. 다시 하면 카카오를 최대 123번 더 부르고,
 * 옮긴 위치에서는 그 사이에 검색부터 다시 해야 한다.
 */
function backToCandidates() {
  if (view.kind !== "result") return;
  setView({
    kind: "candidates",
    anchor: view.anchor,
    result: view.result,
    candidates: view.candidates,
  });
}
```

두 화면에 속성을 넘긴다.

```tsx
{view.kind === "candidates" ? (
  <CandidateScreen
    whereLabel={anchorLabel(view.anchor)}
    onChangeWhere={() => setView({ kind: "search" })}
    candidates={view.candidates}
    onChoose={choose}
    onReshuffle={reshuffle}
    onDecideForMe={decideForMe}
  />
) : null}

{view.kind === "result" ? (
  <ResultScreen
    whereLabel={anchorLabel(view.anchor)}
    onChangeWhere={() => setView({ kind: "search" })}
    onBackToCandidates={backToCandidates}
    // 나머지 속성은 지금 넘기는 것을 그대로 둔다
  />
) : null}
```

- [ ] **단계 5: 검증한다**

실행: `just check`
기대: 종료코드 0

- [ ] **단계 6: 손으로 한 번 눌러 본다**

화면 조각에는 시험이 붙지 않으므로 이 세 가지는 눈으로 확인한다.

```bash
just dev   # 화면 3000, 서버 8090
```

1. 지금 있는 곳으로 찾으면 줄에 `지금 있는 곳에서 찾았어요`가 뜬다
2. 다른 곳으로 찾으면 그 장소 이름이 뜨고, `바꾸기`가 검색 화면으로 간다
3. 결과 화면에서 `다른 종류 고르기`를 누르면 후보 화면으로 돌아가고, 기준 위치 줄이 그대로 남아 있으며, `다시 뽑기`가 동작한다

- [ ] **단계 7: 커밋한다**

```bash
git add web/components/CandidateScreen.tsx web/components/ResultScreen.tsx web/app/page.tsx
git commit -m "feat(web): 어디를 기준으로 찾았는지 알리고 후보 화면으로 돌아갈 수 있게 한다"
```

---

## Task 10: README를 지금 상태에 맞춘다

**파일**
- 수정: `README.md`

**참조할 스킬·에이전트:** `writing-guidelines`(문서 문체 확인)

**완료조건:** README를 처음 읽는 사람이 위치를 옮겨 찾는 길을 알 수 있고, 아래 네 곳이 실제와 맞는다.

- [ ] **단계 1: 네 곳을 고친다**

1. **화면 그림** — "화면 네 개"를 다섯 개로 늘리고 위치 검색 화면을 넣는다. 시작 화면의 단추를 `지금 있는 곳에서 찾기`·`다른 곳에서 찾기`·(있을 때만)`~로 다시 찾기`로 바꾼다.
2. **"어떻게 동작하나"** — 장소 이름 검색이 어떻게 끼어드는지 한 문단 더한다. 45곳 상한과 `is_end`를 봐야 하는 이유를 적는다.
3. **브라우저에 남는 것** — 지금 "딱 세 가지"와 "하나 더"라고 적혀 있는 자리에 사용자가 친 검색어를 더한다. **카카오가 준 장소 이름과 좌표는 저장하지 않는다는 것을 분명히 적는다.**
4. **"아직 없는 것들"** — `주소를 직접 입력해 위치 지정`을 뺀다. 대신 **지도에서 핀을 옮기는 것은 아직 없다**는 것을 적는다.

5. **폴더 구조** — 새 파일 넷(`SearchScreen.tsx`·`anchor.ts`·`spots.ts`·`places/route.ts`·`kakao/spots.go`)을 더한다.

- [ ] **단계 2: 문서와 코드가 맞는지 확인한다**

README에 적은 파일 경로가 전부 실재하는지 확인한다.

```bash
cd .. && grep -oE '(web|api|docs)/[a-zA-Z0-9/._-]+' README.md | sort -u | while read -r p; do
  [ -e "$p" ] || echo "없는 경로: $p"
done
```

- [ ] **단계 3: 커밋한다**

```bash
git add README.md
git commit -m "docs: 위치를 옮겨 찾는 기능을 README에 반영한다"
```

---

## Task 11: 설계 문서의 완료 조건을 하나씩 확인한다

**파일**
- 수정: `docs/superpowers/specs/2026-09-20-move-search-location-design.md`(7절의 체크박스를 채운다)

**참조할 스킬·에이전트:** `/code-review`, `pr-review-toolkit:silent-failure-hunter`, `pr-review-toolkit:comment-analyzer`, `pr-review-toolkit:pr-test-analyzer`, `web-design-guidelines`

**완료조건:** 설계 문서 7절의 열한 개 조건이 모두 실제로 확인되고, 확인 방법과 결과가 문서에 적힌다.

- [ ] **단계 1: 자동으로 확인되는 것을 돌린다**

```bash
just check
```

- [ ] **단계 2: 서버를 띄워 손으로 확인한다**

```bash
just dev   # 화면 3000, 서버 8090
```

확인할 것(설계 문서 7절 순서대로):

1. 브라우저에서 위치 권한을 차단한 채 `다른 곳에서 찾기`로 결과 화면까지 닿는가
2. `경주`를 찾으면 열다섯 곳이 나오고 `더 보기`로 늘어나며, 끝에 닿으면 단추가 사라지고 더 좁혀 찾으라는 안내가 뜨는가
3. `강남역`(34곳)에서도 마지막 쪽에서 단추가 사라지는가
4. 마지막 쪽을 넘겨도 같은 장소가 쌓이지 않는가 → `lib/spots.test.ts`가 지킨다
5. 후보·결과 화면에 기준 위치가 뜨고 문구가 갈리는가
6. `다른 종류 고르기`로 돌아가 `다시 뽑기`가 되는가
7. 빈 결과에서 `다시 찾아보기`가 옮긴 위치로 다시 찾는가 → 음식점이 드문 좌표로 확인한다
8. 개발자 도구에서 `random-choice.keyword.v1`에 좌표와 장소 이름이 없는가
9. 헤더 없이 `/api/v1/places`를 부르면 401인가

```bash
INTERNAL_API_KEY=testkey PORT=8090 go run ./cmd/server &
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8090/api/v1/places?query=경주"
# 401을 기대한다
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Internal-Key: testkey" "http://localhost:8090/api/v1/places?query=경주"
# 200을 기대한다(카카오 열쇠가 있을 때)
```

- [ ] **단계 2-1: 카카오 호출 예산을 실제로 잰다**

설계 문서는 "검색 한 번에 1회, `더 보기`를 끝까지 눌러도 3회"라고 적었다. 이것은 계산이지 실측이 아니다. 가짜 카카오 서버로 호출 횟수를 세어 확인하고, 다르면 설계 문서를 고친다.

- [ ] **단계 3: 리뷰를 받는다**

`/code-review`를 한 번 이상 돌린다. React·Next.js 코드는 Vercel 권장 사항을 기준에 포함한다. 그 밖에 이 저장소에서 자주 난 사고에 맞춰 아래를 함께 돌린다.

- `pr-review-toolkit:comment-analyzer` — 주석의 근거가 코드와 맞는지. 이 저장소에서 여섯 번 어긋났다
- `pr-review-toolkit:pr-test-analyzer` — 시험이 실제로 무엇을 지키는지
- `pr-review-toolkit:silent-failure-hunter` — 조용히 삼키는 실패가 없는지

지적을 그대로 받지 않는다. 근거가 약하면 확인한 뒤 판단하고, 받아들이지 않기로 한 것도 `docs/autopilot/move-search-location/DECISIONS.md`에 이유와 함께 남긴다.

- [ ] **단계 4: 설계 문서의 체크박스를 채운다**

각 조건 옆에 **어떻게 확인했는지와 결과**를 적는다. 명령을 돌리지 않은 채 통과했다고 적지 않는다.

- [ ] **단계 5: 커밋한다**

```bash
git add docs/superpowers/specs/2026-09-20-move-search-location-design.md
git commit -m "docs: 완료 조건을 실제 확인 결과로 채운다"
```

---

## 전체 완료조건

- [ ] Task 1~11의 모든 체크박스가 채워졌다
- [ ] `just check`가 종료코드 0으로 끝난 출력이 대화에 남아 있다
- [ ] 설계 문서 7절의 열한 개 조건이 각각 확인 방법과 결과와 함께 채워졌다
- [ ] 카카오가 준 좌표·장소 이름이 브라우저에 저장되지 않는 것이 시험으로 막혀 있다(`lib/anchor.test.ts`)
- [ ] 마지막 쪽이 되풀이돼도 목록이 불어나지 않는 것이 시험으로 막혀 있다(`lib/spots.test.ts`)
- [ ] 새로 쓴 시험이 각각 방어를 껐을 때 실제로 실패하는 것을 확인했다
- [ ] `api/go.mod`의 의존성 목록이 여전히 비어 있다
- [ ] main에 머지하지 않았고 원격에 푸시하지 않았다
