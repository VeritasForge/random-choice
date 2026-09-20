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

// spotPageJSON은 카카오 장소 이름 검색 응답 한 페이지를 흉내 낸다.
// page를 식별자에 섞는 이유는 client_test.go의 pageJSON과 같다 —
// 페이지마다 다른 장소가 오는 것이 실제 모습이고, 같은 식별자를 주면
// 중복 제거가 실제로 도는지 확인할 수 없다.
func spotPageJSON(page, count int, isEnd bool) string {
	docs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		docs = append(docs, fmt.Sprintf(`{
			"id": "s%d-%d",
			"place_name": "장소%d-%d",
			"category_group_name": "관광명소",
			"address_name": "경북 경주시 인왕동 %d",
			"road_address_name": "경북 경주시 원화로 %d",
			"x": "129.21%02d",
			"y": "35.83%02d"
		}`, page, i, page, i, i, i, i, i))
	}
	return fmt.Sprintf(`{"documents": [%s], "meta": {"is_end": %t}}`,
		strings.Join(docs, ","), isEnd)
}

func TestSearchSpotsReturnsOnePage(t *testing.T) {
	var gotQuery, gotPage, gotSize string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query().Get("query")
		gotPage = r.URL.Query().Get("page")
		gotSize = r.URL.Query().Get("size")
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spotPageJSON(1, 15, false))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, isEnd, err := client.SearchSpots(context.Background(), "경주", 1)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(spots) != 15 {
		t.Fatalf("15곳을 기대했는데 %d곳이다", len(spots))
	}
	if isEnd {
		t.Error("is_end가 false인 응답인데 끝났다고 답했다")
	}
	if gotQuery != "경주" {
		t.Errorf("검색어를 그대로 보내야 한다: %q", gotQuery)
	}
	// size는 카카오가 허용하는 최대값이어야 한다. 이보다 크면 400이 오고,
	// 작으면 같은 45곳을 받는 데 호출이 더 든다.
	if gotSize != "15" {
		t.Errorf("size는 15여야 한다: %q", gotSize)
	}
	if gotPage != "1" {
		t.Errorf("page를 그대로 보내야 한다: %q", gotPage)
	}
	if spots[0].Name != "장소1-0" || spots[0].Address != "경북 경주시 원화로 0" {
		t.Errorf("장소 이름과 주소를 옮기지 못했다: %+v", spots[0])
	}
	if spots[0].Category != "관광명소" {
		t.Errorf("분류를 옮기지 못했다: %+v", spots[0])
	}
	// 카카오는 x가 경도, y가 위도다. 바꿔 읽으면 지구 반대편을 조회하게 된다.
	if spots[0].Lng < 129 || spots[0].Lng > 130 || spots[0].Lat < 35 || spots[0].Lat > 36 {
		t.Errorf("경도와 위도가 뒤바뀌었다: lat=%v lng=%v", spots[0].Lat, spots[0].Lng)
	}
}

func TestSearchSpotsReportsEnd(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spotPageJSON(3, 4, true))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, isEnd, err := client.SearchSpots(context.Background(), "강남역", 3)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if !isEnd {
		t.Error("카카오가 끝이라고 했으면 그대로 알려야 한다")
	}
	if len(spots) != 4 {
		t.Fatalf("4곳을 기대했는데 %d곳이다", len(spots))
	}
}

// 한 페이지만 부르는지 확인한다. 음식점 조회(SearchRestaurants)는 세 페이지를
// 스스로 도는데, 장소 검색은 `더 보기`를 누를 때마다 한 페이지씩 받아야 하므로
// 여기서 여러 페이지를 돌면 화면이 통제할 수 없게 된다.
func TestSearchSpotsCallsKakaoOnce(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, spotPageJSON(1, 15, false))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	if _, _, err := client.SearchSpots(context.Background(), "경주", 1); err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if calls != 1 {
		t.Errorf("카카오를 한 번만 불러야 하는데 %d번 불렀다", calls)
	}
}

// 도로명 주소가 비면 지번 주소로 대신한다. 둘 다 비는 장소는 드물지만,
// 주소가 빈 줄이 목록에 뜨면 사용자가 어디인지 알 수 없다.
func TestSearchSpotsFallsBackToLotAddress(t *testing.T) {
	body := `{"documents":[{"id":"s1","place_name":"이름","category_group_name":"",
		"address_name":"경북 경주시 인왕동 1","road_address_name":"","x":"129.2","y":"35.8"}],
		"meta":{"is_end":true}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, body)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, _, err := client.SearchSpots(context.Background(), "경주", 1)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if spots[0].Address != "경북 경주시 인왕동 1" {
		t.Errorf("도로명이 비면 지번을 써야 한다: %q", spots[0].Address)
	}
}

// 좌표를 읽지 못한 한 건은 버리고 나머지는 살린다. 좌표가 없으면 그 장소를
// 골라도 조회할 자리가 없고, NaN·무한대는 JSON으로 만들 수 없어 응답 전체를 실패시킨다.
func TestSearchSpotsDropsUnreadableCoordinates(t *testing.T) {
	body := `{"documents":[
		{"id":"bad","place_name":"좌표이상","category_group_name":"","address_name":"주소","road_address_name":"","x":"NaN","y":"35.8"},
		{"id":"good","place_name":"멀쩡","category_group_name":"","address_name":"주소","road_address_name":"","x":"129.2","y":"35.8"}],
		"meta":{"is_end":true}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, body)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("test-key", server.URL, server.Client())
	spots, _, err := client.SearchSpots(context.Background(), "경주", 1)
	if err != nil {
		t.Fatalf("오류가 나면 안 된다: %v", err)
	}
	if len(spots) != 1 || spots[0].ID != "good" {
		t.Errorf("좌표를 못 읽은 한 건만 버려야 한다: %+v", spots)
	}
}

func TestSearchSpotsMapsErrorStatuses(t *testing.T) {
	cases := []struct {
		name   string
		status int
		want   error
	}{
		{"한도 초과", http.StatusTooManyRequests, ErrQuotaExceeded},
		{"열쇠 거부", http.StatusUnauthorized, ErrInvalidKey},
		{"권한 없음", http.StatusForbidden, ErrInvalidKey},
		{"서버 오류", http.StatusInternalServerError, ErrUpstream},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
			}))
			defer server.Close()

			client := NewClientWithBaseURL("test-key", server.URL, server.Client())
			_, _, err := client.SearchSpots(context.Background(), "경주", 1)
			if !errors.Is(err, tc.want) {
				t.Errorf("%v를 기대했는데 %v가 왔다", tc.want, err)
			}
		})
	}
}

// 오류 본문에 검색어와 열쇠가 실려 나가지 않아야 한다. 카카오 앞에 게이트웨이가
// 있으면 그것이 답하는 오류 문서에 요청한 값이 되울려 들어올 수 있다.
//
// 두 경우를 각각 따로 시험한다. 처음에는 한 응답에 URL 전체(r.URL.String())와
// "key=test-key"를 같이 실어 봤는데, url.Values.Encode()가 "비밀장소"를
// %EB%B9%84...로 퍼센트 인코딩해 버려 그 응답 본문에 "비밀장소"라는 글자가
// 애초에 나타나지 않았다 — 열쇠 쪽 보호만 있어도 검색어 확인이 항상 통과해
// describeErrorBody의 query 인자를 빼도 시험이 실패하지 않았다(변이 시험으로 확인).
// 그래서 검색어는 게이트웨이가 사람이 읽게 풀어 보여주는 경우(디코딩된 문자열이
// 메시지에 그대로 실리는 경우)를 흉내 내어 따로 확인한다.
func TestSearchSpotsErrorHidesSecrets(t *testing.T) {
	cases := []struct {
		name   string
		body   string
		hidden string
	}{
		{
			name:   "카카오 열쇠가 되울림",
			body:   `{"errorType":"Gateway","message":"실패: 요청이 거부됨 (key=test-key)"}`,
			hidden: "test-key",
		},
		{
			name:   "검색어가 되울림",
			body:   `{"errorType":"Gateway","message":"실패: 검색어 비밀장소를 처리하지 못했습니다"}`,
			hidden: "비밀장소",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprint(w, tc.body)
			}))
			defer server.Close()

			client := NewClientWithBaseURL("test-key", server.URL, server.Client())
			_, _, err := client.SearchSpots(context.Background(), "비밀장소", 1)
			if err == nil {
				t.Fatal("오류가 나야 한다")
			}
			if strings.Contains(err.Error(), tc.hidden) {
				t.Errorf("오류에 감춰야 할 값이 들어 있다: %v", err)
			}
		})
	}
}
