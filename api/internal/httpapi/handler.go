// Package httpapi는 화면이 부를 수 있는 기능을 제공한다.
// 값 검사와 응답 형태 만들기만 하고, 아무것도 저장하지 않는다.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
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
	if finder == nil {
		writeError(w, http.StatusInternalServerError, "not_configured",
			"서버에 카카오 열쇠가 설정되지 않았습니다.")
		return
	}

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
func parseCoordinates(r *http.Request) (float64, float64, bool) {
	query := r.URL.Query()
	lat, err := strconv.ParseFloat(query.Get("lat"), 64)
	if err != nil || lat < -90 || lat > 90 {
		return 0, 0, false
	}
	lng, err := strconv.ParseFloat(query.Get("lng"), 64)
	if err != nil || lng < -180 || lng > 180 {
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
