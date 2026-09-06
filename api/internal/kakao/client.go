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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/geo"
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
	// DefaultSearchTimeout은 세 페이지를 합친 전체 상한이다.
	// 페이지마다 5초를 따로 세면 최악 15초가 걸리는데, 그동안 브라우저는
	// "주변을 살펴보는 중…"에 갇히고 서버는 연결과 고루틴을 붙잡고 있다.
	// 한 조회가 전체로 얼마나 걸릴 수 있는지를 한곳에서 정한다.
	//
	// 이 값은 다른 두 곳의 근거가 된다 — 서버의 응답 쓰기 상한·종료 대기(cmd/server/main.go)와
	// 화면의 요청 상한(web/lib/api.ts). 세 값의 순서가 뒤집히면 안 된다.
	// Go 쪽 시험(cmd/server/main_test.go)은 이름을 내보낸 덕에 이 값을 직접 읽는다.
	// 화면 쪽은 언어가 달라 읽을 수 없으므로 web/lib/api.test.ts가 이 파일의 소스에서
	// 숫자를 뽑아 대조한다 — 그쪽 정규식이 이 선언 모양에 기대고 있다.
	DefaultSearchTimeout = 12 * time.Second
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
		searchTimeout: DefaultSearchTimeout,
	}
}

// NewClientWithBaseURL은 시험에서 가짜 서버를 가리키게 할 때 쓴다.
func NewClientWithBaseURL(apiKey, baseURL string, hc *http.Client) *Client {
	return &Client{
		apiKey:        apiKey,
		baseURL:       baseURL,
		http:          hc,
		searchTimeout: DefaultSearchTimeout,
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

// perimeterOffsetM은 둘레 지점을 중심에서 얼마나 옮길지다.
//
// 400m인 근거: 2026-09-06 실측에서 네 지역(홍대입구·강남·판교·상계) 모두
// 중심이 실제로 보는 범위가 반경 100~160m였다. 400m 떨어진 지점의 원은
// 그것과 만날 수 없어 겹치는 가게가 0곳이었고, 45곳이 약 220곳이 됐다.
// 새로 나온 가게는 사용자 원위치에서 127~618m(중앙값 194~394m)에 있었다.
//
// 이 값이 사용자에게 가장 좋은 거리인지는 확인되지 않았다. 300m나 500m가
// 나을 수도 있다(설계 문서 14절).
const perimeterOffsetM = 400.0

// SearchAround는 사용자 위치와 그 둘레 네 지점을 조회해 합친다.
//
// 왜 한 지점으로 부족한가: 카카오는 한 조회에 가까운 45곳까지만 준다.
// 사람이 많은 곳에서는 그 45곳이 반경 100~160m 안에 다 들어가서, 반경을
// 넓혀도 목록이 같다. 그 상태에서 음식 종류를 잘게 나누면 카드 절반이
// 가게 한 곳짜리가 된다(실측 43%). 다섯 지점을 보면 6%로 떨어진다.
//
// 돌려주는 모든 Place.Distance는 카카오가 준 값이 아니라 사용자가 준
// lat,lng 기준으로 다시 계산한 값이다. 카카오의 거리는 조회 중심 기준이라
// 그대로 쓰면 412m가 24m로 표시된다.
func (c *Client) SearchAround(ctx context.Context, lat, lng float64, radius int) ([]Place, error) {
	// 중심을 먼저 부른다. 다섯을 한꺼번에 쏘면 우리 요청 하나가 카카오 호출을
	// 열다섯 개 동시에 내는데, 429가 순간 호출 제한이라면 사용자가 한 명뿐일 때도
	// 그중 몇 개가 튕긴다. 하필 중심이 튕기면 전체가 실패로 답해진다.
	center, err := c.SearchRestaurants(ctx, lat, lng, radius)
	if err != nil {
		return nil, err
	}

	type point struct{ lat, lng float64 }
	offsets := [4][2]float64{
		{perimeterOffsetM, 0},  // 북
		{0, perimeterOffsetM},  // 동
		{-perimeterOffsetM, 0}, // 남
		{0, -perimeterOffsetM}, // 서
	}
	points := make([]point, 0, len(offsets))
	for _, o := range offsets {
		pLat, pLng := geo.Offset(lat, lng, o[0], o[1])
		points = append(points, point{pLat, pLng})
	}

	// 둘레는 보강이다. 하나가 실패해도 그 지점만 버리고 계속한다 —
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
				slog.Warn("둘레 지점 조회에 실패해 그 지점을 건너뜁니다",
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
				// 어느 항목이 깨졌는지만 남긴다. 좌표는 물론이고 가게 식별자도 남기지 않는다 —
				// 그 가게는 사용자 반경(기본 500m) 안에 있어, 어느 쪽이든 위치를 좁히는 단서가 된다.
				// 형식이 바뀐 것을 알아채는 데는 항목 이름으로 충분하다.
				// 몇 건이 빠졌는지는 이 줄이 찍힌 횟수로 센다 — httpapi 쪽 dropped는
				// 음식 종류를 못 뽑은 가게만 세는 다른 수치이므로 여기 건수를 대신하지 않는다.
				slog.Warn("카카오 응답 한 건을 해석하지 못해 건너뜁니다", "field", badField)
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
		snippet, readErr := io.ReadAll(io.LimitReader(res.Body, errorBodyLimit))
		if readErr != nil && (ctx.Err() != nil || errors.Is(readErr, context.DeadlineExceeded)) {
			// 본문을 읽는 도중 상한에 걸렸다. 조회 전체 상한일 수도, 페이지 한 건의
			// 상한(http.Client.Timeout)일 수도 있다 — 후자는 조회 전체 ctx가 아직
			// 살아 있어 ctx.Err()가 nil이므로 readErr 자체도 함께 봐야 한다.
			// 이 사실을 버리면 시간 초과가 그냥 "응답 코드 5xx"로 보여,
			// 부르는 쪽이 504로 답할 근거를 잃는다.
			cause := ctx.Err()
			if cause == nil {
				cause = readErr
			}
			return nil, fmt.Errorf("%w: 응답 코드 %d: 본문을 읽지 못했습니다: %w",
				ErrUpstream, res.StatusCode, cause)
		}
		return nil, fmt.Errorf("%w: 응답 코드 %d: %s", ErrUpstream, res.StatusCode,
			describeErrorBody(snippet, c.apiKey, query.Get("x"), query.Get("y")))
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

// kakaoError는 카카오가 오류 본문에 담아 주는 형식이다.
type kakaoError struct {
	ErrorType string `json:"errorType"`
	Message   string `json:"message"`
}

// describeErrorBody는 오류 본문에서 진단에 쓸 부분만 뽑는다.
// secrets에는 밖으로 나가면 안 되는 값(카카오 열쇠, 방금 보낸 좌표)을 넘긴다.
//
// 본문을 그대로 싣지 않는 이유: 카카오 앞에 게이트웨이가 있으면 그것이 답하는 오류 문서에는
// 요청한 주소나 헤더가 되울려 들어올 수 있다. 그 주소의 x·y가 사용자 좌표이고 헤더에는
// 카카오 열쇠가 들어 있어, 통째로 실으면 stripURL로 막아 둔 것이 이 경로로 다시 새어 나간다.
//
// 카카오가 정한 형식(errorType이 있는 JSON)일 때만 그 두 항목을 옮긴다. 다만 형식이 맞다는
// 것이 "카카오가 답했다"는 증명은 아니다 — 게이트웨이도 같은 모양으로 답할 수 있다.
// 그래서 옮길 내용에 우리가 보낸 값이 그대로 들어 있으면 되울림으로 보고 통째로 버린다.
// 진단 정보를 조금 잃더라도 좌표·열쇠가 로그에 남는 것보다 낫다.
func describeErrorBody(body []byte, secrets ...string) string {
	trimmed := bytes.TrimSpace(body)
	var parsed kakaoError
	if err := json.Unmarshal(trimmed, &parsed); err == nil && parsed.ErrorType != "" {
		detail := fmt.Sprintf("%s: %s", parsed.ErrorType, parsed.Message)
		for _, secret := range secrets {
			if secret != "" && strings.Contains(detail, secret) {
				return "요청 값이 되울려 온 본문이라 설명을 버렸습니다"
			}
		}
		return detail
	}
	return fmt.Sprintf("카카오 형식이 아닌 본문 %d바이트", len(trimmed))
}
