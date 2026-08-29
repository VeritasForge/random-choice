package kakao

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// pageJSON은 카카오 응답 한 페이지를 흉내 낸다.
// x는 경도, y는 위도이며 카카오는 이 값들을 문자열로 준다.
//
// page를 식별자에 섞는 이유: 페이지마다 다른 가게가 오는 것이 실제 모습이다.
// 예전에는 모든 페이지가 같은 식별자를 주었는데, 그러면 세 페이지를 합쳤을 때
// 같은 가게 15곳이 45곳으로 세어지는 동작을 시험이 오히려 정답으로 고정하게 된다.
func pageJSON(page, count int, isEnd bool) string {
	docs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		docs = append(docs, fmt.Sprintf(`{
			"id": "p%d-%d",
			"place_name": "가게%d-%d",
			"category_name": "음식점 > 한식 > 육류,고기",
			"phone": "02-000-0000",
			"address_name": "서울 강남구 역삼동 1",
			"road_address_name": "서울 강남구 테헤란로 %d",
			"place_url": "http://place.map.kakao.com/p%d-%d",
			"x": "127.02%02d",
			"y": "37.49%02d",
			"distance": "%d"
		}`, page, i, page, i, i, page, i, i, i, i*10))
	}
	return fmt.Sprintf(`{"documents": [%s], "meta": {"is_end": %t}}`,
		strings.Join(docs, ","), isEnd)
}

func TestSearchRestaurantsReadsAllThreePages(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, pageJSON(calls, 15, calls == 3))
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
		fmt.Fprint(w, pageJSON(1, 3, true))
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
		fmt.Fprint(w, pageJSON(1, 1, true))
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
		fmt.Fprint(w, pageJSON(calls, 15, false))
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

func TestSearchRestaurantsAsksForEachPageInOrder(t *testing.T) {
	// 페이지 번호를 실제로 올려 보내는지 확인한다. 번호를 1로 고정해도
	// 호출 횟수와 결과 개수만 보는 시험은 전부 통과하므로, 쿼리를 직접 봐야 한다.
	var pages []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pages = append(pages, r.URL.Query().Get("page"))
		fmt.Fprint(w, pageJSON(len(pages), 15, len(pages) == 3))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	if _, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500); err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	want := []string{"1", "2", "3"}
	if strings.Join(pages, ",") != strings.Join(want, ",") {
		t.Errorf("보낸 page 값이 %v다. %v여야 한다", pages, want)
	}
}

func TestSearchRestaurantsGivesEveryPlaceItsOwnIdentity(t *testing.T) {
	// 세 페이지를 합친 결과에 같은 가게가 두 번 들어 있으면 화면 목록에 두 번 나오고
	// (React key도 겹친다), 종류별 가게 수가 실제보다 부풀어 보인다.
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		fmt.Fprint(w, pageJSON(calls, 15, calls == 3))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	seen := make(map[string]struct{}, len(places))
	for _, place := range places {
		if _, duplicate := seen[place.ID]; duplicate {
			t.Fatalf("식별자 %q가 두 번 나왔다", place.ID)
		}
		seen[place.ID] = struct{}{}
	}
	if len(seen) != 45 {
		t.Errorf("서로 다른 가게가 %d곳이다. 45곳이어야 한다", len(seen))
	}
}

func TestSearchRestaurantsDropsDuplicatesAcrossPages(t *testing.T) {
	// 카카오가 페이지 경계에서 같은 가게를 다시 주는 경우.
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		// 세 페이지가 모두 같은 가게 목록을 준다.
		fmt.Fprint(w, pageJSON(1, 15, calls == 3))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(places) != 15 {
		t.Errorf("%d곳을 받았다. 같은 가게는 한 번만 세어 15곳이어야 한다", len(places))
	}
}

func TestSearchRestaurantsDiscardsEarlierPagesWhenALaterPageFails(t *testing.T) {
	// client.go의 주석이 약속하는 규칙: 페이지 하나가 실패하면 그때까지 모은 것도 버린다.
	// 일부만 돌려주면 음식 종류 분포가 조용히 치우친 채 정상 응답인 척 화면에 올라간다.
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			fmt.Fprint(w, pageJSON(1, 15, false))
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Fatalf("상위 서비스 오류여야 한다. 받은 오류: %v", err)
	}
	if len(places) != 0 {
		t.Errorf("%d곳을 돌려줬다. 실패했으면 한 곳도 돌려주면 안 된다", len(places))
	}
}

func TestSearchRestaurantsReportsInvalidKey(t *testing.T) {
	// 열쇠가 거부된 것은 재시도로 낫지 않는다. 일시 장애와 같은 통에 담으면
	// 화면이 "잠시 후 다시 시도"라고 안내해 사용자가 성공하지 않을 재시도를 반복한다.
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(status)
		}))
		client := NewClientWithBaseURL("test-key", server.URL, server.Client())
		_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
		if !errors.Is(err, ErrInvalidKey) {
			t.Errorf("%d는 열쇠 거부 오류여야 한다. 받은 오류: %v", status, err)
		}
		if errors.Is(err, ErrUpstream) {
			t.Errorf("%d를 일시 장애로 다루면 안 된다", status)
		}
		server.Close()
	}
}

func TestSearchRestaurantsSkipsNegativeDistance(t *testing.T) {
	// 음수 거리는 있을 수 없는 값이다. 통과시키면 거리순 정렬에서 맨 앞에 서서
	// "가장 가까운 집"으로 표시된다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [
			{"id": "1", "place_name": "음수거리", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "-1"},
			{"id": "2", "place_name": "멀쩡한집", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "10"}
		], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("한 건이 깨졌다고 조회 전체가 실패하면 안 된다: %v", err)
	}
	if len(places) != 1 || places[0].ID != "2" {
		t.Fatalf("멀쩡한 한 곳만 남아야 한다. 받은 값: %+v", places)
	}
}

func TestSearchRestaurantsDoesNotLeakCoordinatesInError(t *testing.T) {
	// 통신 실패 오류에는 요청 주소가 통째로 들어가고, 그 주소의 x·y가 곧 사용자 좌표다.
	// 그 오류 문자열이 그대로 로그로 흘러가므로 좌표가 남지 않아야 한다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	baseURL := server.URL
	server.Close() // 닫아 두어 연결 실패를 만든다.

	client := NewClientWithBaseURL("test-key", baseURL, &http.Client{})
	_, err := client.SearchRestaurants(context.Background(), 37.4979, 127.0276, 500)
	if err == nil {
		t.Fatal("연결에 실패했어야 한다")
	}
	for _, secret := range []string{"37.4979", "127.0276", "test-key"} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("오류 문자열에 %q가 들어 있다: %v", secret, err)
		}
	}
}

func TestSearchRestaurantsKeepsPlacesWithoutIdentifier(t *testing.T) {
	// 식별자가 빈 건은 중복 판정을 할 수 없다. 하나로 뭉뚱그리면 멀쩡한 가게가
	// 조용히 사라지고, 결과가 적게 나오는 이유를 아무도 추적하지 못한다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [
			{"id": "", "place_name": "이름없는집1", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "10"},
			{"id": "", "place_name": "이름없는집2", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "20"},
			{"id": "1", "place_name": "멀쩡한집", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "30"}
		], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(places) != 3 {
		t.Errorf("%d곳을 받았다. 식별자가 비어도 버리지 않아 3곳이어야 한다", len(places))
	}
}

func TestSearchRestaurantsStopsAtItsOwnTimeLimit(t *testing.T) {
	// 조회 전체 상한이 실제로 도는지 확인한다. 상한이 사라지거나 늘어나면
	// 카카오가 느린 날 브라우저는 로딩 화면에 갇히고 서버는 연결을 붙잡고 있는다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // 상한이 끊어 줄 때까지 응답하지 않는다
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	client.searchTimeout = 50 * time.Millisecond

	start := time.Now()
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	elapsed := time.Since(start)

	if !errors.Is(err, ErrUpstream) {
		t.Errorf("상위 서비스 오류여야 한다. 받은 오류: %v", err)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("시간 초과임을 errors.Is로 알아볼 수 있어야 한다. 받은 오류: %v", err)
	}
	if elapsed > 3*time.Second {
		t.Errorf("%v가 걸렸다. 상한(50ms)에서 끊겼어야 한다", elapsed)
	}
}

func TestSearchRestaurantsReportsCancellationAsSuch(t *testing.T) {
	// 사용자가 창을 닫으면 요청이 취소된다. 부르는 쪽이 그것을 카카오 장애와
	// 구분할 수 있어야 흔한 정상 동작이 오류 로그를 채우지 않는다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(ctx, 37.49, 127.02, 500)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("취소임을 errors.Is로 알아볼 수 있어야 한다. 받은 오류: %v", err)
	}
}

func TestSearchRestaurantsIncludesKakaoErrorBody(t *testing.T) {
	// 상태 코드만 남기면 원인 후보가 넓은 채로 남는다. 좌표를 로그에 남기지 않기로 했으므로
	// 요청을 재구성할 수도 없어, 카카오가 준 설명이 유일한 단서다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"errorType":"InvalidArgument","message":"radius is out of range"}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Fatalf("상위 서비스 오류여야 한다. 받은 오류: %v", err)
	}
	if !strings.Contains(err.Error(), "radius is out of range") {
		t.Errorf("카카오가 준 설명이 오류에 담겨야 한다. 받은 오류: %v", err)
	}
}

func TestConstructorsGiveEveryClientASearchBudget(t *testing.T) {
	// 조회 상한이 상수에서 필드로 옮겨 오면서 그것을 채우는 책임이 생성자로 넘어갔다.
	// 운영용 NewClient는 어떤 시험도 부르지 않으므로, 여기서 값이 채워지는지 못박는다.
	// 비어 있으면 상한이 0이 되어 모든 조회가 즉시 시간 초과로 끝난다 — 전면 장애다.
	for name, client := range map[string]*Client{
		"NewClient":            NewClient("test-key"),
		"NewClientWithBaseURL": NewClientWithBaseURL("test-key", "http://example.test", &http.Client{}),
	} {
		if client.searchTimeout != DefaultSearchTimeout {
			t.Errorf("%s의 조회 상한이 %v다. %v여야 한다",
				name, client.searchTimeout, DefaultSearchTimeout)
		}
		if client.http == nil {
			t.Errorf("%s가 HTTP 클라이언트를 채우지 않았다", name)
		}
	}
}

func TestSearchRestaurantsDoesNotLeakCoordinatesWhenTheURLIsBad(t *testing.T) {
	// 주소를 만들지 못한 경우에도 오류에 그 주소가 담긴다. 통신 실패 경로만 막고
	// 이쪽을 놓치면, 설정이 잘못된 배포에서 좌표가 그대로 로그에 쌓인다.
	client := NewClientWithBaseURL("test-key", "http://[::1]:namedport", &http.Client{})
	_, err := client.SearchRestaurants(context.Background(), 37.4979, 127.0276, 500)
	if err == nil {
		t.Fatal("주소를 만들지 못했어야 한다")
	}
	for _, secret := range []string{"37.4979", "127.0276", "test-key"} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("오류 문자열에 %q가 들어 있다: %v", secret, err)
		}
	}
}

func TestSearchRestaurantsSkipsBrokenLatitude(t *testing.T) {
	// 경도·거리와 달리 위도가 깨진 경우를 다루는 갈래는 시험 자료에 없었다.
	// 항목 이름을 잘못 적어 두어도(복사·붙여넣기에서 흔하다) 아무도 모른다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"documents": [
			{"id": "1", "place_name": "위도깨짐", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "NaN", "distance": "10"},
			{"id": "2", "place_name": "멀쩡한집", "category_name": "음식점 > 분식",
			 "road_address_name": "주소", "place_url": "", "x": "127.0", "y": "37.5", "distance": "10"}
		], "meta": {"is_end": true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	places, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err != nil {
		t.Fatalf("한 건이 깨졌다고 조회 전체가 실패하면 안 된다: %v", err)
	}
	if len(places) != 1 || places[0].ID != "2" {
		t.Fatalf("멀쩡한 한 곳만 남아야 한다. 받은 값: %+v", places)
	}
}

func TestToPlaceNamesTheBrokenField(t *testing.T) {
	// 로그에 남는 것이 항목 이름뿐이므로, 그 이름이 실제로 맞아야 진단에 쓸모가 있다.
	base := document{ID: "1", X: "127.0", Y: "37.5", Distance: "10"}
	tests := []struct {
		name string
		doc  document
		want string
	}{
		{"정상", base, ""},
		{"경도가 깨짐", document{ID: "1", X: "NaN", Y: "37.5", Distance: "10"}, "x"},
		{"위도가 깨짐", document{ID: "1", X: "127.0", Y: "Inf", Distance: "10"}, "y"},
		{"거리가 깨짐", document{ID: "1", X: "127.0", Y: "37.5", Distance: "가까움"}, "distance"},
		{"거리가 음수", document{ID: "1", X: "127.0", Y: "37.5", Distance: "-1"}, "distance"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, got := toPlace(tt.doc); got != tt.want {
				t.Errorf("깨진 항목을 %q라고 했다. %q여야 한다", got, tt.want)
			}
		})
	}
}

func TestSearchRestaurantsDoesNotEchoUnknownErrorBodies(t *testing.T) {
	// 카카오 앞에 게이트웨이가 있으면 그것이 답하는 오류 문서에 요청 주소나 헤더가
	// 되울려 들어올 수 있다. 그 주소의 x·y가 사용자 좌표이고 헤더에는 열쇠가 있다.
	// 카카오가 정한 형식이 아니면 내용을 옮기지 않아야 한다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, "<html><body>Bad Gateway<br>request: %s<br>auth: %s</body></html>",
			r.URL.String(), r.Header.Get("Authorization"))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.4979, 127.0276, 500)
	if !errors.Is(err, ErrUpstream) {
		t.Fatalf("상위 서비스 오류여야 한다. 받은 오류: %v", err)
	}
	for _, secret := range []string{"37.4979", "127.0276", "test-key", "KakaoAK"} {
		if strings.Contains(err.Error(), secret) {
			t.Errorf("오류 문자열에 %q가 들어 있다: %v", secret, err)
		}
	}
}

func TestSearchRestaurantsCapsTheErrorBody(t *testing.T) {
	// 카카오 형식의 message가 아주 길어도 오류 문자열이 로그를 잠그면 안 된다.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"errorType":"InvalidArgument","message":"%s"}`, strings.Repeat("가", 5000))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	_, err := client.SearchRestaurants(context.Background(), 37.49, 127.02, 500)
	if err == nil {
		t.Fatal("오류가 나야 한다")
	}
	if len(err.Error()) > 2000 {
		t.Errorf("오류 문자열이 %d바이트다. 상한 언저리에서 멈춰야 한다", len(err.Error()))
	}
}
