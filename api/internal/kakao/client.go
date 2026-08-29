// Package kakao는 카카오 로컬 API와 이야기하는 유일한 창구다.
// 카카오는 응답 결과를 저장하는 것을 금지하므로, 여기서도 아무것도 저장하지 않는다.
package kakao

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
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
	// 카카오는 한 조회당 최대 45건만 돌려준다. 우리가 15개씩(pageSize) 요청하기로
	// 정했으므로, 45 ÷ 15 = 3페이지(maxPages)면 카카오가 줄 수 있는 만큼을 다 받는다.
	// 즉 maxPages는 카카오가 아니라 우리가 pageSize를 정하며 함께 정한 값이다.
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
			// 페이지 하나가 실패하면 그때까지 모은 것도 버리고 오류로 답한다.
			// 조용히 일부만 돌려주면 음식 종류 분포가 티 안 나게 뒤틀리는데,
			// 이는 무작위 뽑기 기능에는 정직한 오류보다 더 나쁘다.
			return nil, err
		}
		for _, doc := range parsed.Documents {
			place, ok := toPlace(doc)
			if !ok {
				// 조용히 버리지 않는다. 이런 응답이 오기 시작하면 알아야 한다.
				slog.Warn("카카오 응답 한 건을 해석하지 못해 건너뜁니다",
					"id", doc.ID, "x", doc.X, "y", doc.Y, "distance", doc.Distance)
				continue
			}
			places = append(places, place)
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
//
// 바꾸지 못하거나 실수로 표현할 수 없는 값이면 그 한 건을 버린다(두 번째 반환값 false).
// 버리는 이유가 두 가지다.
//   - strconv.ParseFloat는 "NaN"과 "Inf"를 오류 없이 받아들인다. 그대로 두면 JSON은
//     NaN을 표현하지 못해 인코딩이 실패하는데, 그때는 이미 200을 보낸 뒤라 클라이언트가
//     빈 본문을 받는다. 한 건의 이상값이 응답 전체를 날린다.
//   - 거리를 못 읽어 0으로 두면, 거리 오름차순 정렬에서 그 손상된 건이 1등이 되어
//     "가장 가까운 집"으로 표시된다. 0m는 사실이 아니다.
//
// 한 건을 버리는 것이 45곳 전체를 실패시키거나 거짓을 보여주는 것보다 낫다.
func toPlace(doc document) (Place, bool) {
	lng, ok := finiteFloat(doc.X)
	if !ok {
		return Place{}, false
	}
	lat, ok := finiteFloat(doc.Y)
	if !ok {
		return Place{}, false
	}
	distance, err := strconv.Atoi(doc.Distance)
	if err != nil || distance < 0 {
		return Place{}, false
	}

	address := doc.RoadAddress
	if address == "" {
		address = doc.AddressName
	}
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
	}, true
}

// finiteFloat는 문자열을 실수로 바꾸되, NaN과 무한대는 거부한다.
func finiteFloat(raw string) (float64, bool) {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, false
	}
	return value, true
}
