// Package kakao는 카카오 로컬 API와 이야기하는 유일한 창구다.
// 카카오는 응답 결과를 저장하는 것을 금지하므로, 여기서도 아무것도 저장하지 않는다.
package kakao

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	// 카카오는 한 조회로 최대 45건까지만 노출한다. 우리가 15개씩(pageSize)
	// 요청하기로 정했으므로, 45 ÷ 15 = 3페이지(maxPages)면 그 상한을 다 채운다.
	// 즉 maxPages는 카카오가 정해 준 값이 아니라 우리가 pageSize를 정하며 함께
	// 정한 값이다. 결과 수를 늘리려면 두 값을 함께 봐야 한다.
	pageSize       = 15
	maxPages       = 3
	requestTimeout = 5 * time.Second
	// defaultSearchTimeout은 세 페이지를 합친 전체 상한이다.
	// 페이지마다 5초를 따로 세면 최악 15초가 걸리는데, 그동안 브라우저는
	// "주변을 살펴보는 중…"에 갇히고 서버는 연결과 고루틴을 붙잡고 있다.
	// 한 조회가 전체로 얼마나 걸릴 수 있는지를 한곳에서 정한다.
	//
	// 이 값은 다른 두 곳의 근거가 된다 — 서버의 WriteTimeout·종료 대기(cmd/server/main.go)와
	// 화면의 요청 상한(web/lib/api.ts). 바꾸면 그 두 곳도 함께 봐야 한다.
	defaultSearchTimeout = 12 * time.Second
	// errorBodyLimit은 카카오 오류 응답에서 읽어 둘 본문의 최대 길이다.
	// 원인을 남기되 로그가 폭주하지 않을 만큼만 자른다.
	errorBodyLimit = 512
)

var (
	// ErrQuotaExceeded는 카카오 호출 한도를 다 썼을 때 나온다.
	ErrQuotaExceeded = errors.New("kakao: 호출 한도를 초과했습니다")
	// ErrInvalidKey는 카카오가 열쇠를 거부했을 때 나온다(401·403).
	// ErrUpstream과 나누는 이유: 이쪽은 재시도로 절대 낫지 않는 설정 문제라
	// 사용자에게 "잠시 후 다시"라고 안내하면 거짓말이 된다.
	ErrInvalidKey = errors.New("kakao: 열쇠가 거부되었습니다")
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
	// searchTimeout은 한 조회 전체의 상한이다. 시험에서 짧게 바꿔 쓸 수 있도록
	// 상수가 아니라 필드로 둔다 — 상수면 상한이 실제로 도는지 확인할 방법이 없다.
	searchTimeout time.Duration
}

// NewClient는 실제 카카오를 가리키는 조회기를 만든다.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:        apiKey,
		baseURL:       defaultBaseURL,
		http:          &http.Client{Timeout: requestTimeout},
		searchTimeout: defaultSearchTimeout,
	}
}

// NewClientWithBaseURL은 시험에서 가짜 서버를 가리키게 할 때 쓴다.
func NewClientWithBaseURL(apiKey, baseURL string, hc *http.Client) *Client {
	return &Client{
		apiKey:        apiKey,
		baseURL:       baseURL,
		http:          hc,
		searchTimeout: defaultSearchTimeout,
	}
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
// 한 조회의 상한은 pageSize × maxPages = 45곳이다.
func (c *Client) SearchRestaurants(ctx context.Context, lat, lng float64, radius int) ([]Place, error) {
	ctx, cancel := context.WithTimeout(ctx, c.searchTimeout)
	defer cancel()

	places := make([]Place, 0, pageSize*maxPages)
	// 카카오가 페이지 경계에서 같은 가게를 두 번 주는 경우를 대비한다.
	// 그대로 두면 결과 목록에 같은 가게가 두 번 나오고(화면의 React key도 겹친다),
	// 종류별 가게 수가 실제보다 부풀어 보인다.
	// (추첨 자체는 종류 "이름" 집합에서 균등하게 뽑으므로 가게 수와 무관하다 — web/lib/pick.ts 참조)
	seen := make(map[string]struct{}, pageSize*maxPages)

	for page := 1; page <= maxPages; page++ {
		parsed, err := c.fetchPage(ctx, lat, lng, radius, page)
		if err != nil {
			// 페이지 하나가 실패하면 그때까지 모은 것도 버리고 오류로 답한다.
			// 조용히 일부만 돌려주면 음식 종류 분포가 티 안 나게 뒤틀리는데,
			// 이는 무작위 뽑기 기능에는 정직한 오류보다 더 나쁘다.
			return nil, err
		}
		for _, doc := range parsed.Documents {
			place, badField := toPlace(doc)
			if badField != "" {
				// 조용히 버리지 않는다. 이런 응답이 오기 시작하면 알아야 한다.
				// 값 자체(좌표)는 남기지 않고 어느 항목이 깨졌는지만 남긴다 —
				// 가게 좌표는 사용자 반경 안에 있어 위치를 좁히는 단서가 되기 때문이다.
				slog.Warn("카카오 응답 한 건을 해석하지 못해 건너뜁니다",
					"id", doc.ID, "field", badField)
				continue
			}
			// 식별자가 빈 건은 중복 판정을 할 수 없다. 하나로 뭉뚱그리면
			// 멀쩡한 가게들이 사라지므로, 그냥 그대로 살린다.
			if place.ID != "" {
				if _, duplicate := seen[place.ID]; duplicate {
					continue
				}
				seen[place.ID] = struct{}{}
			}
			places = append(places, place)
		}
		if parsed.Meta.IsEnd {
			break
		}
	}
	return places, nil
}

// stripURL은 오류에서 요청 주소를 떼어 낸다.
// net/url과 net/http는 실패를 *url.Error로 감싸는데 그 문자열에는 요청 주소가
// 통째로 들어 있고, 그 주소의 x·y가 곧 사용자의 좌표다. 안쪽 오류만 남겨
// 좌표가 로그로 새지 않게 한다.
//
// 안쪽 오류를 %v가 아니라 %w로 감싼다. %v로 넣으면 문자열만 남아
// errors.Is(err, context.Canceled) 같은 판정이 불가능해지고,
// 그러면 부르는 쪽이 "사용자가 창을 닫은 것"과 "카카오가 죽은 것"을 구분하지 못한다.
func stripURL(err error) error {
	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		return urlErr.Err
	}
	return err
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
		// 주소를 만들지 못한 경우에도 오류에 그 주소가 담긴다.
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
		// 카카오는 실패 이유를 본문에 담아 준다. 상태 코드만 남기면 원인 후보가 넓은 채로
		// 남고, 좌표를 로그에 남기지 않기로 했으므로 요청을 그대로 재구성할 수도 없다.
		// 본문에는 사용자 좌표가 들어 있지 않으므로 앞부분만 잘라 함께 남긴다.
		snippet, _ := io.ReadAll(io.LimitReader(res.Body, errorBodyLimit))
		return nil, fmt.Errorf("%w: 응답 코드 %d: %s",
			ErrUpstream, res.StatusCode, bytes.TrimSpace(snippet))
	}

	var parsed searchResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("%w: 응답을 해석하지 못했습니다: %w", ErrUpstream, err)
	}
	return &parsed, nil
}

// toPlace는 카카오의 응답 한 건을 우리 형태로 옮긴다.
// 카카오는 좌표와 거리를 문자열로 주므로 여기서 숫자로 바꾼다.
// 두 번째 반환값은 해석하지 못한 항목의 이름이고, 전부 성공하면 빈 문자열이다.
//
// 바꾸지 못하거나 실수로 표현할 수 없는 값이면 그 한 건을 버린다.
// 버리는 이유가 두 가지다.
//   - strconv.ParseFloat는 "NaN"과 "Inf"를 오류 없이 받아들인다. 그 값은 JSON으로
//     표현할 수 없어 응답을 만드는 단계에서 실패한다. 응답 조립 쪽에도 방어가 있지만
//     (httpapi.writeJSON이 본문을 먼저 만들고 성공했을 때만 보낸다), 애초에
//     들어오지 않게 막는 것이 1차 방어선이다.
//   - 거리를 못 읽어 0으로 두면, 거리 오름차순 정렬에서 그 손상된 건이 1등이 되어
//     "가장 가까운 집"으로 표시된다. 0m는 사실이 아니다.
//
// 한 건을 버리는 것이 45곳 전체를 실패시키거나 거짓을 보여주는 것보다 낫다.
func toPlace(doc document) (Place, string) {
	lng, ok := finiteFloat(doc.X)
	if !ok {
		return Place{}, "x"
	}
	lat, ok := finiteFloat(doc.Y)
	if !ok {
		return Place{}, "y"
	}
	distance, err := strconv.Atoi(doc.Distance)
	if err != nil || distance < 0 {
		return Place{}, "distance"
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
	}, ""
}

// finiteFloat는 문자열을 실수로 바꾸되, NaN과 무한대는 거부한다.
func finiteFloat(raw string) (float64, bool) {
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, false
	}
	return value, true
}
