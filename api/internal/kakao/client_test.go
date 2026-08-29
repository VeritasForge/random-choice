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

// pageJSON은 카카오 응답 한 페이지를 흉내 낸다.
// x는 경도, y는 위도이며 카카오는 이 값들을 문자열로 준다.
func pageJSON(count int, isEnd bool) string {
	docs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		docs = append(docs, fmt.Sprintf(`{
			"id": "%d",
			"place_name": "가게%d",
			"category_name": "음식점 > 한식 > 육류,고기",
			"phone": "02-000-0000",
			"address_name": "서울 강남구 역삼동 1",
			"road_address_name": "서울 강남구 테헤란로 %d",
			"place_url": "http://place.map.kakao.com/%d",
			"x": "127.02%02d",
			"y": "37.49%02d",
			"distance": "%d"
		}`, i, i, i, i, i, i, i*10))
	}
	return fmt.Sprintf(`{"documents": [%s], "meta": {"is_end": %t}}`,
		strings.Join(docs, ","), isEnd)
}

func TestSearchRestaurantsReadsAllThreePages(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, pageJSON(15, calls == 3))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 3 {
		t.Errorf("카카오를 %d번 불렀다. 3번이어야 한다", calls)
	}
	if len(places) != 45 {
		t.Errorf("%d곳을 받았다. 45곳이어야 한다", len(places))
	}
}

func TestSearchRestaurantsStopsWhenKakaoSaysItIsTheEnd(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		fmt.Fprint(w, pageJSON(3, true))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 1 {
		t.Errorf("카카오를 %d번 불렀다. 마지막 페이지라고 했으므로 1번이어야 한다", calls)
	}
	if len(places) != 3 {
		t.Errorf("%d곳을 받았다. 3곳이어야 한다", len(places))
	}
}

func TestSearchRestaurantsSendsCorrectRequest(t *testing.T) {
	var gotAuth, gotPath string
	var gotQuery map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		gotQuery = map[string]string{}
		for key := range r.URL.Query() {
			gotQuery[key] = r.URL.Query().Get(key)
		}
		fmt.Fprint(w, pageJSON(1, true))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	if _, err := client.SearchRestaurants(context.Background(), 37.5, 127.0, 800); err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}

	if gotAuth != "KakaoAK test-key" {
		t.Errorf("Authorization 헤더가 %q다. \"KakaoAK test-key\"여야 한다", gotAuth)
	}
	if gotPath != "/v2/local/search/category.json" {
		t.Errorf("경로가 %q다", gotPath)
	}
	want := map[string]string{
		"category_group_code": "FD6",
		"x":                   "127",
		"y":                   "37.5",
		"radius":              "800",
		"page":                "1",
		"size":                "15",
		"sort":                "distance",
	}
	for key, wantValue := range want {
		if gotQuery[key] != wantValue {
			t.Errorf("%s가 %q다. %q여야 한다", key, gotQuery[key], wantValue)
		}
	}
}

func TestSearchRestaurantsParsesFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [{
			"id": "26338954",
			"place_name": "연돈",
			"category_name": "음식점 > 일식 > 돈까스",
			"phone": "02-111-2222",
			"address_name": "서울 강남구 역삼동 1",
			"road_address_name": "서울 강남구 테헤란로 123",
			"place_url": "http://place.map.kakao.com/26338954",
			"x": "127.0281",
			"y": "37.4981",
			"distance": "120"
		}], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(places) != 1 {
		t.Fatalf("%d곳을 받았다. 1곳이어야 한다", len(places))
	}
	got := places[0]
	want := Place{
		ID:           "26338954",
		Name:         "연돈",
		CategoryName: "음식점 > 일식 > 돈까스",
		RoadAddress:  "서울 강남구 테헤란로 123",
		Phone:        "02-111-2222",
		PlaceURL:     "http://place.map.kakao.com/26338954",
		Lat:          37.4981,
		Lng:          127.0281,
		Distance:     120,
	}
	if got != want {
		t.Errorf("받은 값 %+v\n원하는 값 %+v", got, want)
	}
}

func TestSearchRestaurantsFallsBackToLotAddress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [{
			"id": "1", "place_name": "가게", "category_name": "음식점 > 분식",
			"address_name": "서울 강남구 역삼동 1", "road_address_name": "",
			"place_url": "", "x": "127.0", "y": "37.5", "distance": "10"
		}], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, _ := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if places[0].RoadAddress != "서울 강남구 역삼동 1" {
		t.Errorf("도로명 주소가 비었으면 지번 주소를 써야 한다. 받은 값 %q", places[0].RoadAddress)
	}
}

func TestSearchRestaurantsReportsQuotaExceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrQuotaExceeded) {
		t.Errorf("한도 초과 오류여야 한다. 받은 오류: %v", err)
	}
}

func TestSearchRestaurantsReportsUpstreamFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("상위 서비스 오류여야 한다. 받은 오류: %v", err)
	}
}

func TestSearchRestaurantsReportsBrokenJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "이건 JSON이 아니다")
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("해석 실패도 상위 서비스 오류로 다뤄야 한다. 받은 오류: %v", err)
	}
}

func TestSearchRestaurantsSkipsUnparsableRecords(t *testing.T) {
	// 카카오가 좌표에 "NaN"을 돌려주는 경우. ParseFloat는 이걸 오류 없이 받아들이므로
	// 여기서 막지 않으면 NaN이 응답까지 흘러가 JSON 인코딩을 깨뜨린다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [
			{"id": "1", "place_name": "좌표깨짐", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "NaN", "y": "37.5", "distance": "10"},
			{"id": "2", "place_name": "거리깨짐", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "가까움"},
			{"id": "3", "place_name": "무한대", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "Inf", "y": "37.5", "distance": "10"},
			{"id": "4", "place_name": "멀쩡한집", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "10"}
		], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("한 건이 깨졌다고 조회 전체가 실패하면 안 된다: %v", err)
	}
	if len(places) != 1 || places[0].ID != "4" {
		t.Fatalf("멀쩡한 한 곳만 남아야 한다. 받은 값: %+v", places)
	}
}

func TestSearchRestaurantsStopsAtThreePagesEvenIfKakaoNeverEnds(t *testing.T) {
	// 카카오가 is_end를 영영 켜 주지 않아도 우리가 스스로 멈춰야 한다.
	// 이 시험이 maxPages 상한을 고정한다 — 상한을 올리면 여기서 실패한다.
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		fmt.Fprint(w, pageJSON(15, false))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 3 {
		t.Errorf("카카오를 %d번 불렀다. is_end가 안 와도 3번에서 멈춰야 한다", calls)
	}
	if len(places) != 45 {
		t.Errorf("%d곳을 받았다. 15 × 3 = 45곳이어야 한다", len(places))
	}
}
