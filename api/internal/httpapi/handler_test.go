package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
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
	if body.Cuisines[0].Name != "한식" || body.Cuisines[0].Count != 2 {
		t.Errorf("첫 종류가 %+v다. 개수가 많은 \"한식\" 2개가 먼저여야 한다", body.Cuisines[0])
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
		Cuisines []struct {
			Name  string `json:"name"`
			Count int    `json:"count"`
		} `json:"cuisines"`
		Places []struct {
			ID string `json:"id"`
		} `json:"places"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Places) != 1 || body.Places[0].ID != "2" {
		t.Errorf("음식 종류를 만들 수 없는 가게는 빼야 한다. 받은 값: %+v", body.Places)
	}
	// 집계 쪽도 함께 확인한다. 가게 목록에서만 빼고 집계에 남기면
	// 이름이 빈 종류가 후보로 뽑혀 글자 없는 버튼이 그려지고,
	// 그것을 누르면 해당하는 가게가 하나도 없는 막다른 화면이 나온다.
	if len(body.Cuisines) != 1 || body.Cuisines[0].Name != "분식" || body.Cuisines[0].Count != 1 {
		t.Errorf("빈 이름이 집계에 남으면 안 된다. 받은 값: %+v", body.Cuisines)
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

func TestNearbyNeverSendsSuccessWithABrokenBody(t *testing.T) {
	// NaN은 JSON으로 표현할 수 없어 응답을 만드는 단계에서 실패한다.
	// 상태 코드를 먼저 보내고 나중에 인코딩하면 "200 + 빈 본문"이 나가는데,
	// 클라이언트는 성공했다고 믿으면서 아무것도 받지 못한다.
	// 그 상황을 실제로 재현해, 실패가 실패로 보이는지 확인한다.
	//
	// 1차 방어선은 kakao 패키지의 finiteFloat다(TestSearchRestaurantsSkipsUnparsableRecords).
	// 여기는 그 방어선이 뚫렸을 때를 다룬다.
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "좌표깨짐", CategoryName: "음식점 > 분식", Distance: 10, Lat: math.NaN(), Lng: 127.0},
	}}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0")

	if rec.Code == http.StatusOK {
		t.Errorf("응답을 만들지 못했는데 200을 보냈다 (본문: %q)", rec.Body.String())
	}
	if rec.Body.Len() == 0 {
		t.Fatal("본문이 비어 있다")
	}
	var parsed map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("응답이 유효한 JSON이 아니다: %v (본문: %s)", err, rec.Body.String())
	}
}

func TestNearbyResponseIsValidJSON(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "정상", CategoryName: "음식점 > 분식", Distance: 10, Lat: 37.5, Lng: 127.0},
	}}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0")

	if rec.Code != http.StatusOK {
		t.Fatalf("응답 코드가 %d다. 200이어야 한다", rec.Code)
	}
	var parsed map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("응답이 유효한 JSON이 아니다: %v (본문: %s)", err, rec.Body.String())
	}
}

func TestResponsesForbidCaching(t *testing.T) {
	// 카카오는 결과 저장을 금지한다. 서버가 아무 말을 안 하면 중간에 있는 캐시
	// (회사 프록시·CDN)가 200 GET을 자기 판단으로 저장할 수 있다.
	finder := &fakeFinder{}
	for _, target := range []string{
		"/api/v1/nearby?lat=37.5&lng=127.0",
		"/api/v1/nearby?lat=999&lng=127.0",
	} {
		rec := get(t, NewHandler(finder), target)
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s의 Cache-Control이 %q다. \"no-store\"여야 한다", target, got)
		}
	}
}

func TestNearbyMapsInvalidKey(t *testing.T) {
	// 열쇠가 거부된 것은 재시도로 낫지 않으므로 일시 장애와 구분해야 한다.
	rec := get(t, NewHandler(&fakeFinder{err: kakao.ErrInvalidKey}), "/api/v1/nearby?lat=37.5&lng=127.0")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("응답 코드가 %d다. 500이어야 한다", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "invalid_key" {
		t.Errorf("오류 코드가 %q다. \"invalid_key\"여야 한다", got)
	}
}

func TestNearbyAcceptsBoundaryValues(t *testing.T) {
	// 경계 그 자체를 넣지 않으면 비교 연산자가 한 칸 밀려도(< 를 <= 로) 잡히지 않는다.
	// 오류 문구가 "100m 이상 20000m 이하"라고 약속하므로 그 약속을 시험으로 고정한다.
	tests := []struct {
		name   string
		target string
	}{
		{"반경 하한", "/api/v1/nearby?lat=37.5&lng=127.0&radius=100"},
		{"반경 상한", "/api/v1/nearby?lat=37.5&lng=127.0&radius=20000"},
		{"위도 하한", "/api/v1/nearby?lat=-90&lng=127.0"},
		{"위도 상한", "/api/v1/nearby?lat=90&lng=127.0"},
		{"경도 하한", "/api/v1/nearby?lat=37.5&lng=-180"},
		{"경도 상한", "/api/v1/nearby?lat=37.5&lng=180"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := get(t, NewHandler(&fakeFinder{}), tt.target)
			if rec.Code != http.StatusOK {
				t.Errorf("응답 코드가 %d다. 경계값은 받아들여 200이어야 한다 (본문: %s)",
					rec.Code, rec.Body.String())
			}
		})
	}
}

func TestNearbyRejectsJustOutsideBoundaries(t *testing.T) {
	tests := []struct {
		name      string
		target    string
		wantError string
	}{
		{"반경이 하한보다 1 작다", "/api/v1/nearby?lat=37.5&lng=127.0&radius=99", "invalid_radius"},
		{"반경이 상한보다 1 크다", "/api/v1/nearby?lat=37.5&lng=127.0&radius=20001", "invalid_radius"},
		{"위도가 하한을 넘는다", "/api/v1/nearby?lat=-90.1&lng=127.0", "invalid_coordinates"},
		{"위도가 상한을 넘는다", "/api/v1/nearby?lat=90.1&lng=127.0", "invalid_coordinates"},
		{"경도가 하한을 넘는다", "/api/v1/nearby?lat=37.5&lng=-180.1", "invalid_coordinates"},
		{"경도가 상한을 넘는다", "/api/v1/nearby?lat=37.5&lng=180.1", "invalid_coordinates"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := get(t, NewHandler(&fakeFinder{}), tt.target)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("응답 코드가 %d다. 400이어야 한다", rec.Code)
			}
			if got := decodeError(t, rec)["error"]; got != tt.wantError {
				t.Errorf("오류 코드가 %q다. %q여야 한다", got, tt.wantError)
			}
		})
	}
}

func TestHealthz(t *testing.T) {
	rec := get(t, NewHandler(nil), "/healthz")
	if rec.Code != http.StatusOK {
		t.Errorf("응답 코드가 %d다. 200이어야 한다", rec.Code)
	}
}

func TestReadyzReflectsWhetherLookupsCanWork(t *testing.T) {
	// healthz는 프로세스가 살아 있는지만 답한다. 열쇠가 없어 조회가 100% 실패하는
	// 서버도 healthz는 200이므로, 트래픽을 보내도 되는지는 readyz가 답한다.
	if rec := get(t, NewHandler(nil), "/readyz"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("열쇠가 없을 때 readyz가 %d다. 503이어야 한다", rec.Code)
	}
	if rec := get(t, NewHandler(&fakeFinder{}), "/readyz"); rec.Code != http.StatusOK {
		t.Errorf("열쇠가 있을 때 readyz가 %d다. 200이어야 한다", rec.Code)
	}
}

func TestStatusEndpointsForbidCaching(t *testing.T) {
	// 상태 확인이 캐시되면 이미 죽은 서버가 계속 살아 있다고 답하는 셈이 된다.
	for _, target := range []string{"/healthz", "/readyz"} {
		rec := get(t, NewHandler(&fakeFinder{}), target)
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s의 Cache-Control이 %q다. \"no-store\"여야 한다", target, got)
		}
		if got := rec.Header().Get("Content-Type"); got == "" {
			t.Errorf("%s에 Content-Type이 없다", target)
		}
	}
}

func TestNearbyMapsItsOwnTimeLimit(t *testing.T) {
	// 우리가 정한 조회 상한에 걸린 것은 카카오가 오류를 준 것과 다르다.
	// 502(상대가 잘못됨)가 아니라 504(우리가 기다리기를 그만둠)여야 하고,
	// 화면도 "지금 서버가 붐빈다"는 다른 문구를 보여 준다.
	finder := &fakeFinder{err: fmt.Errorf("%w: %w", kakao.ErrUpstream, context.DeadlineExceeded)}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.5&lng=127.0")
	if rec.Code != http.StatusGatewayTimeout {
		t.Errorf("응답 코드가 %d다. 504여야 한다", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "timeout" {
		t.Errorf("오류 코드가 %q다. \"timeout\"이어야 한다", got)
	}
}

func TestNearbyStaysQuietWhenTheClientHangsUp(t *testing.T) {
	// 사용자가 창을 닫는 것은 흔한 정상 동작이다. 이미 끊긴 연결에 응답을 쓰지 않고,
	// 카카오 장애와 같은 등급으로 로그를 남기지도 않아야 한다.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nearby?lat=37.5&lng=127.0", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	finder := &fakeFinder{err: fmt.Errorf("%w: %w", kakao.ErrUpstream, context.Canceled)}
	NewHandler(finder).ServeHTTP(rec, req)

	if rec.Body.Len() != 0 {
		t.Errorf("끊긴 연결에 본문을 썼다: %s", rec.Body.String())
	}
}
