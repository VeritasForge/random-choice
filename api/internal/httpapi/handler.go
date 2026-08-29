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

// internalErrorBody는 응답을 만들지 못했을 때 보낼 마지막 수단이다.
// 미리 만들어 둔 문자열이라 이것을 보내다가 다시 실패할 일이 없다.
const internalErrorBody = `{"error":"internal_error","message":"서버가 응답을 만들지 못했습니다."}`

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
		writeOK(w)
	})
	// readyz는 "이 서버에 요청을 보내도 되는가"에 답한다.
	// healthz(프로세스가 살아 있는가)와 나누는 이유: 열쇠가 없는 서버도 프로세스는
	// 멀쩡히 살아 있어서 healthz만 보면 초록불이지만, 실제 조회는 100% 실패한다.
	// 나중에 로드밸런서를 붙일 때 트래픽 게이트는 이쪽을 봐야 한다.
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		if finder == nil {
			writeError(w, http.StatusServiceUnavailable, "not_configured",
				"서버에 카카오 열쇠가 설정되지 않았습니다.")
			return
		}
		writeOK(w)
	})
	return mux
}

func handleNearby(w http.ResponseWriter, r *http.Request, finder PlaceFinder) {
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

	// 요청 자체가 잘못됐는지를 먼저 가린 다음에 서버 설정을 본다.
	// 잘못된 요청은 열쇠가 있든 없든 호출자의 잘못이라 400이어야 한다.
	// 순서를 반대로 하면 열쇠가 없을 때는 잘못된 요청도 500(not_configured)으로
	// 뭉뚱그려져 책임 소재가 흐려진다.
	if finder == nil {
		writeError(w, http.StatusInternalServerError, "not_configured",
			"서버에 카카오 열쇠가 설정되지 않았습니다.")
		return
	}

	found, err := finder.SearchRestaurants(r.Context(), lat, lng, radius)
	if err != nil {
		// 사용자가 창을 닫거나 브라우저가 요청을 취소한 경우다. 흔한 정상 동작이므로
		// 카카오 장애와 같은 등급(Error)으로 쌓이면 진짜 실패가 그 잡음에 묻힌다.
		// 이미 끊긴 연결에 응답을 쓰려 하지도 않는다.
		if r.Context().Err() != nil {
			slog.Info("요청이 취소되었습니다", "radius", radius)
			return
		}
		// 우리가 정한 조회 상한(kakao 패키지의 searchTimeout)에 걸린 경우다.
		// 카카오가 오류를 준 것이 아니라 우리가 기다리기를 그만둔 것이므로 504가 맞고,
		// 화면도 "지금 서버가 붐빈다"는 다른 문구를 보여 준다.
		if errors.Is(err, context.DeadlineExceeded) {
			slog.Warn("조회가 제한 시간 안에 끝나지 않았습니다", "radius", radius)
			writeError(w, http.StatusGatewayTimeout, "timeout",
				"조회가 제한 시간 안에 끝나지 않았습니다.")
			return
		}
		// 아래 로그에 좌표를 남기지 않는다. 실패는 자주 나는데 좌표는 이 서비스가
		// 다루는 유일한 개인 식별 값이라, 남기면 "누가 언제 어디 있었는지"가
		// 로그에 쌓인다. 저장소를 두지 않기로 한 설계와도 어긋난다.
		// 원인 분석에는 반경과 오류 내용으로 충분하다.
		if errors.Is(err, kakao.ErrQuotaExceeded) {
			// 한도 소진은 버그도 사용자 잘못도 아니지만, 그 순간부터 서비스는
			// 모든 사용자에게 사실상 정지한다. 흔적이 없으면 제보 전까지 아무도 모른다.
			slog.Warn("카카오 호출 한도를 소진했습니다", "radius", radius)
			writeError(w, http.StatusTooManyRequests, "quota_exceeded",
				"오늘 조회 한도를 다 썼습니다. 내일 다시 이용해 주세요.")
			return
		}
		if errors.Is(err, kakao.ErrInvalidKey) {
			// 열쇠가 틀린 것은 재시도로 절대 낫지 않는다. 일시 장애로 안내하면
			// 사용자는 성공하지 않을 재시도를 반복하고 서버는 카카오를 계속 부른다.
			slog.Error("카카오가 열쇠를 거부했습니다", "error", err, "radius", radius)
			writeError(w, http.StatusInternalServerError, "invalid_key",
				"서버의 카카오 열쇠가 유효하지 않습니다.")
			return
		}
		slog.Error("주변 음식점 조회에 실패했습니다", "error", err, "radius", radius)
		writeError(w, http.StatusBadGateway, "upstream_error",
			"장소 정보를 가져오지 못했습니다.")
		return
	}

	writeJSON(w, http.StatusOK, buildResponse(found))
}

// parseCoordinates는 위도·경도를 읽는다. 하나라도 올바르지 않으면 false를 돌려준다.
// NaN을 따로 걸러내는 이유: strconv.ParseFloat는 "nan"을 오류 없이 받아들이는데,
// NaN은 어떤 비교에서도 false라서 범위 검사(-90..90)를 그냥 통과해 버린다.
// 반대로 무한대는 위아래 범위 검사에 각각 걸린다(+Inf는 상한에, -Inf는 하한에)
// 그래서 따로 볼 필요가 없다.
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
//
// 버린 건수를 로그에 남기는 이유: 전부 버려지면 응답은 빈 목록이 되고,
// 화면은 그것을 "주변에 음식점이 없어요"로 보여 준다. 가게는 있었는데
// 하나도 분류하지 못한 것과 정말로 없는 것이 사용자에게 똑같이 보이므로,
// 서버 쪽에라도 구분이 남아 있어야 원인을 찾을 수 있다.
func buildResponse(found []kakao.Place) nearbyResponse {
	places := make([]placeDTO, 0, len(found))
	names := make([]string, 0, len(found))
	dropped := 0

	for _, place := range found {
		name := cuisine.Extract(place.CategoryName)
		if name == "" {
			dropped++
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

	switch {
	case len(found) == 0:
		// 카카오가 한 곳도 주지 않았다. 정말 한적한 곳일 수도 있지만, 열쇠에 권한이 없거나
		// 반경·분류 코드가 조용히 무시되는 상황일 수도 있다. 사용자에게는 두 경우가
		// 똑같이 "음식점이 없어요"로 보이므로 서버 쪽에는 흔적을 남긴다.
		// 정상 결과일 수 있으니 Error가 아니라 Info다 — 이 줄이 몰려 찍히면 전면 장애다.
		slog.Info("카카오가 한 곳도 주지 않았습니다")
	case len(places) == 0:
		// 가게는 받았는데 하나도 분류하지 못했다. 카카오가 분류 문자열 형식을
		// 바꿨다는 신호일 수 있다.
		slog.Error("음식 종류를 하나도 뽑지 못했습니다", "dropped", dropped)
	case dropped > 0:
		slog.Warn("음식 종류를 뽑지 못한 가게를 제외했습니다",
			"dropped", dropped, "total", len(found))
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

// writeJSON은 본문을 먼저 만들고, 성공했을 때만 상태 코드와 함께 보낸다.
//
// 순서가 중요하다. 상태 코드를 먼저 보내고 그다음에 인코딩하면, 인코딩이 실패해도
// 이미 "성공(200)"이라고 말한 뒤라 클라이언트는 200과 빈 본문을 함께 받는다.
// 한 건의 이상값(예: 좌표의 NaN)이 응답 전체를 조용히 날리는 것이다.
// 먼저 만들어 두면 그때는 아직 아무것도 보내지 않았으므로 정직하게 500을 답할 수 있다.
//
// Cache-Control: no-store를 붙이는 이유: 카카오는 결과 저장을 금지하는데,
// 중간에 있는 캐시(회사 프록시·CDN)는 아무 말이 없는 200 GET을 자기 판단으로
// 저장할 수 있다. 저장소를 두지 않겠다는 설계를 서버 안에서만 지키고
// 나가는 응답에는 표시하지 않으면 그 설계가 반쪽이 된다.
func writeJSON(w http.ResponseWriter, status int, body any) {
	encoded, err := json.Marshal(body)
	if err != nil {
		slog.Error("응답을 만들지 못했습니다", "error", err, "status", status)
		writeRaw(w, http.StatusInternalServerError, []byte(internalErrorBody))
		return
	}
	writeRaw(w, status, append(encoded, '\n'))
}

func writeRaw(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if _, err := w.Write(body); err != nil {
		slog.Error("응답을 쓰지 못했습니다", "error", err)
	}
}

// writeOK는 상태 확인 경로의 성공 응답이다.
// JSON이 아니지만 캐시 금지는 다른 응답과 똑같이 붙인다 — 상태 확인이 캐시되면
// 이미 죽은 서버가 계속 살아 있다고 답하는 셈이 된다.
func writeOK(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte("ok")); err != nil {
		slog.Error("응답을 쓰지 못했습니다", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorResponse{Error: code, Message: message})
}
