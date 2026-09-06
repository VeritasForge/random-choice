package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
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

func (f *fakeFinder) SearchAround(_ context.Context, lat, lng float64, radius int) ([]kakao.Place, error) {
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
			ID    string `json:"id"`
			Count int    `json:"count"`
		} `json:"cuisines"`
		Places []struct {
			ID        string `json:"id"`
			CuisineID string `json:"cuisineId"`
			Distance  int    `json:"distance"`
		} `json:"places"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("응답을 해석하지 못했다: %v", err)
	}

	if len(body.Cuisines) != 2 {
		t.Fatalf("음식 종류가 %d개다. 2개여야 한다: %+v", len(body.Cuisines), body.Cuisines)
	}
	if body.Cuisines[0].ID != "gogi" || body.Cuisines[0].Count != 2 {
		t.Errorf("첫 종류가 %+v다. 개수가 많은 \"gogi\" 2개가 먼저여야 한다", body.Cuisines[0])
	}
	if len(body.Places) != 3 {
		t.Fatalf("가게가 %d곳이다. 3곳이어야 한다", len(body.Places))
	}
	if body.Places[0].ID != "2" {
		t.Errorf("첫 가게가 %q다. 가장 가까운 \"2\"여야 한다", body.Places[0].ID)
	}
	if body.Places[0].CuisineID != "bunsik" {
		t.Errorf("첫 가게의 음식 종류가 %q다. \"bunsik\"이어야 한다", body.Places[0].CuisineID)
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
			ID    string `json:"id"`
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
	// 식별자가 빈 종류가 후보로 뽑혀 글자 없는 버튼이 그려지고,
	// 그것을 누르면 해당하는 가게가 하나도 없는 막다른 화면이 나온다.
	if len(body.Cuisines) != 1 || body.Cuisines[0].ID != "bunsik" || body.Cuisines[0].Count != 1 {
		t.Errorf("빈 식별자가 집계에 남으면 안 된다. 받은 값: %+v", body.Cuisines)
	}
}

// 응답이 종류 식별자와 표시 이름을 나눠 실어야 한다.
// 화면이 저장하는 것은 id이고 그리는 것은 label이다. 둘을 나누지 않으면
// 저장되는 값이 카카오 문자열이 되어 이용 정책에 걸린다.
func TestNearbyResponseCarriesCuisineIDAndLabel(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "고깃집", CategoryName: "음식점 > 한식 > 육류,고기",
			Lat: 37.4, Lng: 127.0, Distance: 100},
	}}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.4&lng=127.0&radius=500")

	if rec.Code != http.StatusOK {
		t.Fatalf("상태 = %d, want 200. 본문: %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Cuisines []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
			Count int    `json:"count"`
		} `json:"cuisines"`
		Places []struct {
			CuisineID string `json:"cuisineId"`
		} `json:"places"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("응답을 읽지 못했다: %v", err)
	}
	if len(got.Cuisines) != 1 || got.Cuisines[0].ID != "gogi" {
		t.Fatalf("cuisines = %+v, want id=gogi 하나", got.Cuisines)
	}
	if got.Cuisines[0].Label != "고기·구이" {
		t.Errorf("label = %q, want 고기·구이", got.Cuisines[0].Label)
	}
	if len(got.Places) != 1 || got.Places[0].CuisineID != "gogi" {
		t.Errorf("places[0].cuisineId = %+v, want gogi", got.Places)
	}
}

// 점심 대상이 아닌 가게는 응답에 없어야 한다.
func TestNearbyExcludesNonLunchPlaces(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "위스키바", CategoryName: "음식점 > 술집 > 칵테일바",
			Lat: 37.4, Lng: 127.0, Distance: 50},
		{ID: "2", Name: "밥집", CategoryName: "음식점 > 한식",
			Lat: 37.4, Lng: 127.0, Distance: 60},
	}}
	rec := get(t, NewHandler(finder), "/api/v1/nearby?lat=37.4&lng=127.0&radius=500")

	if strings.Contains(rec.Body.String(), "위스키바") {
		t.Error("술집이 결과에 들어 있다. 점심에 위스키바를 권하면 안 된다")
	}
	if !strings.Contains(rec.Body.String(), "밥집") {
		t.Error("점심 대상인 가게까지 빠졌다")
	}
}

// captureLogs는 기본 기록기를 버퍼로 잠시 갈아 끼우고, 시험이 끝나면 되돌린다.
// 되돌리기를 t.Cleanup에 걸어 두는 이유: 되돌리지 않으면 뒤에 도는 시험의 로그까지
// 이 버퍼로 흘러들어, 이 시험이 다른 시험을 조용히 오염시킨다.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return &buf
}

// 가게를 버린 이유 둘을 따로 세는지 확인한다.
//
// 왜 로그를 대조하는가: 이 결함은 응답 본문에 전혀 드러나지 않는다. 두 이유를 한 숫자로
// 합쳐도 cuisines·places는 글자 하나 달라지지 않고 오직 로그만 달라진다. 그래서 로그를
// 보는 이 시험이 유일한 방어다. 본문만 보는 시험으로 바꾸면 아무것도 지키지 못한다.
//
// 치르는 대가: 이 시험은 로그 문구에 묶인다. 문구를 다듬으면 아래 부분 문자열도 함께
// 고쳐야 한다. 그래서 수치나 조사까지 묶지 않고 안정적인 조각만 본다.
//
// t.Parallel을 쓰지 않는다. 기본 기록기라는 전역을 갈아 끼우므로, 병렬로 돌면
// 서로의 버퍼를 덮어 결과가 뒤섞인다.
func TestNearbyCountsDropReasonsSeparately(t *testing.T) {
	// 함께 넣는 정상 가게. 이것이 없으면 "하나도 뽑지 못했다"는 다른 갈래로 빠져
	// 두 이유를 가르는지와 무관한 것을 보게 된다.
	bapjip := kakao.Place{ID: "2", Name: "밥집", CategoryName: "음식점 > 한식",
		Distance: 60, Lat: 37.4, Lng: 127.0}

	tests := []struct {
		name    string
		dropped kakao.Place
		wantLog bool
	}{
		{
			// 술집을 빼는 것은 의도한 동작이고 실측에서 14%였다. 여기서 경고가 뜨면
			// 거의 매 요청마다 뜨는 셈이라, 아래의 드문 신호가 그 안에 묻힌다.
			name: "점심 대상이 아니어서 뺐으면 경고하지 않는다",
			dropped: kakao.Place{ID: "1", Name: "위스키바", CategoryName: "음식점 > 술집 > 칵테일바",
				Distance: 50, Lat: 37.4, Lng: 127.0},
			wantLog: false,
		},
		{
			// 맞는 규칙이 없는 것은 우리 어휘에 구멍이 있다는 신호다. 실측 664곳 중
			// 3곳뿐이라, 이 한 줄이 뜨지 않으면 구멍을 알아챌 방법이 없다.
			name: "맞는 규칙이 없어 뺐으면 경고한다",
			dropped: kakao.Place{ID: "1", Name: "모르는곳", CategoryName: "음식점 > 우주음식",
				Distance: 50, Lat: 37.4, Lng: 127.0},
			wantLog: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureLogs(t)
			finder := &fakeFinder{places: []kakao.Place{tt.dropped, bapjip}}
			get(t, NewHandler(finder), "/api/v1/nearby?lat=37.4&lng=127.0")

			if got := strings.Contains(logs.String(), "맞는 규칙이 없어"); got != tt.wantLog {
				t.Errorf("\"맞는 규칙이 없어\" 경고 = %v, want %v. 로그: %s",
					got, tt.wantLog, logs.String())
			}
		})
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
