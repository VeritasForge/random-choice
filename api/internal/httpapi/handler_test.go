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
	// 열쇠가 없다는 이유로 500을 돌려주면 책임을 잘못 돌리는 것이고,
	// 설계 문서의 완료 조건도 열쇠 없이 이 400을 확인하도록 되어 있다.
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
