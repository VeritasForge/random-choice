package kakao

import (
	"context"
	"encoding/json"
	"fmt"
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
	ID           string `json:"id"`
	PlaceName    string `json:"place_name"`
	CategoryName string `json:"category_group_name"`
	AddressName  string `json:"address_name"`
	RoadAddress  string `json:"road_address_name"`
	X            string `json:"x"`
	Y            string `json:"y"`
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
// 페이지를 넘겨 요청해도 오류를 주지 않고 마지막 페이지를 그대로 다시 준다.
// 실측 근거: docs/superpowers/specs/2026-09-20-move-search-location-design.md
// 3-3절 — 15개씩 받을 때 4페이지 첫 항목이 3페이지와 같은 `경주버드파크`였고,
// 5개씩 받을 때도 10페이지가 9페이지와 같았다. 이것을 모르고 페이지를 계속
// 올리면 같은 장소가 목록에 끝없이 쌓인다.
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

	// 상태 코드 매핑과 오류 본문 처리는 client.go의 statusError를 그대로 쓴다.
	// 음식점 조회(fetchPage)와 같은 카카오 API 계열이라 오류 규칙이 갈라지면
	// 안 되기 때문이다 — statusError의 주석에 근거를 적어 두었다.
	// 감출 값에 검색어를 넣는다. 사용자가 어디를 찾아봤는지는 좌표만큼은 아니어도
	// 사생활에 닿는 값이고, 게이트웨이 오류 문서에 요청 주소가 되울려 들어오면
	// 그대로 로그에 실린다.
	if err := c.statusError(ctx, res, c.apiKey, query); err != nil {
		return nil, err
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
