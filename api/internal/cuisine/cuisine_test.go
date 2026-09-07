package cuisine

import "testing"

// 실제 카카오 응답에서 뽑은 문자열들이다. 2026-09-06에 네 지역 889곳을 조회해 확인했다.
//
// wantReason이 곧 "뽑혔는가"의 판정이다 — DropNone이면 종류를 뽑은 것이고,
// 나머지 둘은 뺀 것이다. 뺀 이유까지 함께 못 박는 이유: 술집을 "규칙이 없다"로,
// 모르는 분류를 "점심 아님"으로 잘못 세면 서버 로그의 경고가 정반대로 뒤집힌다.
func TestClassifyWithReason(t *testing.T) {
	tests := []struct {
		name       string
		category   string
		wantID     string
		wantReason DropReason
	}{
		// 한식이 뭉치던 문제를 푸는 자리. 여기가 이 작업의 핵심이다.
		{"하위가 없는 한식은 밥집", "음식점 > 한식", "bapjip", DropNone},
		{"찌개도 밥집", "음식점 > 한식 > 찌개,전골", "bapjip", DropNone},
		{"육류고기는 고기구이", "음식점 > 한식 > 육류,고기", "gogi", DropNone},
		{"곱창도 고기구이", "음식점 > 한식 > 육류,고기 > 곱창,막창", "gogi", DropNone},
		{"닭요리는 고기구이가 아니다", "음식점 > 한식 > 육류,고기 > 닭요리", "dak", DropNone},
		{"삼계탕도 닭요리", "음식점 > 한식 > 육류,고기 > 닭요리 > 삼계탕", "dak", DropNone},
		{"치킨도 닭요리", "음식점 > 치킨", "dak", DropNone},
		{"해물생선은 회해물", "음식점 > 한식 > 해물,생선", "hoe", DropNone},
		{"국수는 면국수", "음식점 > 한식 > 국수", "myeon", DropNone},
		{"냉면도 면국수", "음식점 > 한식 > 냉면", "myeon", DropNone},
		{"일본식라면도 면국수", "음식점 > 일식 > 일본식라면", "myeon", DropNone},
		{"국밥은 국밥탕", "음식점 > 한식 > 국밥", "gukbap", DropNone},
		{"감자탕도 국밥탕", "음식점 > 한식 > 감자탕", "gukbap", DropNone},

		// 나머지 갈래
		{"돈까스우동은 따로", "음식점 > 일식 > 돈까스,우동", "donkatsu", DropNone},
		{"초밥은 일식", "음식점 > 일식 > 초밥,롤", "ilsik", DropNone},
		{"하위가 없는 일식", "음식점 > 일식", "ilsik", DropNone},
		{"중국요리는 중식", "음식점 > 중식 > 중국요리", "jungsik", DropNone},
		{"햄버거는 따로", "음식점 > 양식 > 햄버거", "burger", DropNone},
		{"패스트푸드도 햄버거", "음식점 > 패스트푸드 > 맥도날드", "burger", DropNone},
		{"샌드위치는 샐러드쪽", "음식점 > 패스트푸드 > 샌드위치 > 써브웨이", "salad", DropNone},
		{"이탈리안은 양식", "음식점 > 양식 > 이탈리안", "yangsik", DropNone},
		{"베트남음식은 아시아", "음식점 > 아시아음식 > 동남아음식 > 베트남음식", "asia", DropNone},
		{"제과베이커리는 빵간식", "음식점 > 간식 > 제과,베이커리", "bbang", DropNone},
		{"브랜드명이 붙어도 같다", "음식점 > 간식 > 제과,베이커리 > 파리바게뜨", "bbang", DropNone},
		{"구내식당은 밥집", "음식점 > 구내식당", "bapjip", DropNone},

		// 점심 대상이 아닌 것
		{"술집은 뺀다", "음식점 > 술집", "", DropNotLunch},
		{"칵테일바도 뺀다", "음식점 > 술집 > 칵테일바", "", DropNotLunch},
		{"호프요리주점도 뺀다", "음식점 > 술집 > 호프,요리주점", "", DropNotLunch},
		{"아이스크림은 점심이 아니다", "음식점 > 간식 > 아이스크림", "", DropNotLunch},
		{"떡한과도 점심이 아니다", "음식점 > 간식 > 떡,한과", "", DropNotLunch},

		// 규칙이 없는 것
		{"하위가 없으면 종류를 알 수 없다", "음식점", "", DropNoRule},
		{"빈 문자열", "", "", DropNoRule},
		{"모르는 분류", "음식점 > 우주음식", "", DropNoRule},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok, reason := ClassifyWithReason(tt.category)
			if reason != tt.wantReason {
				t.Fatalf("ClassifyWithReason(%q) reason = %v, want %v", tt.category, reason, tt.wantReason)
			}
			// ok와 reason이 어긋나면 부르는 쪽 둘(가게를 뺄지, 어느 통에 셀지)이
			// 서로 다른 답을 보게 된다.
			if want := tt.wantReason == DropNone; ok != want {
				t.Errorf("ClassifyWithReason(%q) ok = %v, want %v", tt.category, ok, want)
			}
			if got.ID != tt.wantID {
				t.Errorf("ClassifyWithReason(%q) ID = %q, want %q", tt.category, got.ID, tt.wantID)
			}
			if tt.wantReason == DropNone && got.Label == "" {
				t.Errorf("ClassifyWithReason(%q)가 빈 이름을 돌려줬다. 화면에 글자 없는 카드가 그려진다", tt.category)
			}
		})
	}
}

// 버리는 이유를 나누지 않으면, 매 요청마다 14%씩 생기는 "점심 아님"이
// "어휘에 구멍이 있다"는 드문 신호를 덮어 버린다.
func TestClassifyWithReasonSeparatesDropCauses(t *testing.T) {
	if _, _, r := ClassifyWithReason("음식점 > 술집"); r != DropNotLunch {
		t.Errorf("술집의 이유 = %v, want DropNotLunch", r)
	}
	if _, _, r := ClassifyWithReason("음식점 > 우주음식"); r != DropNoRule {
		t.Errorf("모르는 분류의 이유 = %v, want DropNoRule", r)
	}
	if _, _, r := ClassifyWithReason("음식점 > 한식"); r != DropNone {
		t.Errorf("정상 분류의 이유 = %v, want DropNone", r)
	}
}

// 어떤 규칙의 조각들이 그보다 앞에 있는 규칙으로 시작하면, 뒤의 규칙은
// 영영 쓰이지 않는 죽은 코드가 된다. 사람 눈으로 볼 일이 아니라 시험이 할 일이다.
func TestNoRuleIsShadowedByAnEarlierOne(t *testing.T) {
	for i, later := range rules {
		for j, earlier := range rules[:i] {
			if len(earlier.pattern) > len(later.pattern) {
				continue
			}
			shadowed := true
			for k, seg := range earlier.pattern {
				if later.pattern[k] != seg {
					shadowed = false
					break
				}
			}
			if shadowed {
				t.Errorf("규칙 %d(%v)가 규칙 %d(%v)에 가려 영영 쓰이지 않는다. 긴 규칙을 앞으로 옮겨라",
					i, later.pattern, j, earlier.pattern)
			}
		}
	}
}

// 어휘가 실제로 다 도달 가능한지 확인한다. 도달 못 하는 어휘는 화면에 영영 안 나온다.
//
// 개수만 세면 안 되는 이유: "bapjip"을 "baljip"으로 오타 내도 개수는 그대로 18개라
// 시험이 통과해 버린다. 그런데 이 뒤에 오는 여러 작업이 정확히 이 문자열들을
// 저장·대조 키로 그대로 쓰므로, 이름이 바뀌면 그 작업들이 조용히 깨진다.
// 그래서 개수가 아니라 이름 집합 전체를 대조한다. 이 목록은 rules에서 뽑지 않고
// 여기 그대로 적는다 — rules에서 뽑으면 rules를 잘못 바꿔도 항상 자기 자신과
// 같아서 시험이 아무것도 못 지킨다.
func TestEveryCuisineIsReachable(t *testing.T) {
	want := map[string]bool{
		"bapjip": true, "gogi": true, "dak": true, "gukbap": true,
		"myeon": true, "hoe": true, "bunsik": true, "jungsik": true,
		"ilsik": true, "donkatsu": true, "yangsik": true, "burger": true,
		"salad": true, "asia": true, "shabu": true, "bbang": true,
		"fusion": true, "dosirak": true,
	}
	reached := map[string]bool{}
	for _, r := range rules {
		if r.cuisine.ID != "" {
			reached[r.cuisine.ID] = true
		}
	}
	for id := range want {
		if !reached[id] {
			t.Errorf("어휘 %q가 어떤 규칙으로도 도달할 수 없다", id)
		}
	}
	for id := range reached {
		if !want[id] {
			t.Errorf("어휘 %q는 설계에 없는데 규칙에 등장한다", id)
		}
	}
}

// 같은 ID가 서로 다른 이름표를 달면, CountBy가 (ID, Label) 전체를 map 키로 쓰기
// 때문에(cuisine.go) 같은 종류가 화면에 카드 두 장으로 갈라진다 — 이 패키지가
// 풀려는 문제(한식이 여러 카드로 쪼개지는 것)를 우리 손으로 다시 만드는 것과 같다.
func TestNoCuisineIDHasTwoLabels(t *testing.T) {
	labelOf := map[string]string{}
	for _, r := range rules {
		if r.cuisine.ID == "" {
			continue
		}
		if prev, ok := labelOf[r.cuisine.ID]; ok {
			if prev != r.cuisine.Label {
				t.Errorf("ID %q가 이름표 %q와 %q 두 가지를 갖는다", r.cuisine.ID, prev, r.cuisine.Label)
			}
			continue
		}
		labelOf[r.cuisine.ID] = r.cuisine.Label
	}
}

func TestCountBy(t *testing.T) {
	got := CountBy([]Cuisine{
		{ID: "gogi", Label: "고기·구이"},
		{ID: "bapjip", Label: "밥집·백반"},
		{ID: "gogi", Label: "고기·구이"},
	})
	if len(got) != 2 {
		t.Fatalf("종류 수 = %d, want 2", len(got))
	}
	// 많은 순으로, 같으면 ID 오름차순으로. 같은 입력이면 언제나 같은 순서여야 시험할 수 있다.
	if got[0].Cuisine.ID != "gogi" || got[0].Count != 2 {
		t.Errorf("첫째 = %+v, want gogi 2곳", got[0])
	}
	if got[1].Cuisine.ID != "bapjip" || got[1].Count != 1 {
		t.Errorf("둘째 = %+v, want bapjip 1곳", got[1])
	}
}

// 곳 수가 같을 때의 차례를 지킨다.
//
// 위 TestCountBy의 자료는 2곳·1곳이라 **동점이 없어서**, 동점 규칙(ID 오름차순)을
// 뒤집거나 아예 지워도 통과한다. sort.Slice는 안정 정렬이 아니고 바탕이 되는 map의
// 순회 순서는 Go가 일부러 뒤섞으므로, 이 규칙이 사라지면 "같은 입력이면 언제나 같은
// 순서"라는 약속이 조용히 깨진다 — 사용자에게는 같은 자리에서 새로고침할 때마다
// 후보 카드 차례가 바뀌는 것으로 나타난다.
//
// 동점을 두 무리(2곳짜리 둘, 1곳짜리 일곱)로 만든 이유는 둘이다.
//
// 첫째, 곳 수를 먼저 보는 것과 동점일 때 ID를 보는 것을 한 시험에서 함께 못 박는다.
//
// 둘째, **1곳짜리 무리가 작으면 이 시험이 확률적으로만 잡는다.** 무리가 셋일 때는
// 동점 규칙을 통째로 지우는 변이가 240회 중 216회(약 90%)만 실패했다 — 나머지는
// map 순회가 우연히 ID 오름차순으로 나와 통과한 것이다. 무리를 일곱으로 늘리면
// 그 우연이 사실상 일어나지 않아 200회 중 200회 실패한다. 방어가 있는지 없는지를
// 운에 맡기지 않으려고 표본을 키웠다.
func TestCountByBreaksTiesByID(t *testing.T) {
	got := CountBy([]Cuisine{
		{ID: "myeon", Label: "면·국수"},
		{ID: "jungsik", Label: "중식"},
		{ID: "bapjip", Label: "밥집·백반"},
		{ID: "asia", Label: "아시아 음식"},
		{ID: "myeon", Label: "면·국수"},
		{ID: "bapjip", Label: "밥집·백반"},
		{ID: "bunsik", Label: "분식"},
		{ID: "dak", Label: "닭요리"},
		{ID: "gogi", Label: "고기·구이"},
		{ID: "hoe", Label: "회·해물"},
		{ID: "salad", Label: "샐러드·샌드위치"},
	})
	ids := make([]string, 0, len(got))
	for _, tally := range got {
		ids = append(ids, tally.Cuisine.ID)
	}
	// 2곳짜리(bapjip·myeon)가 먼저, 그 안에서 ID 오름차순.
	// 그다음 1곳짜리 일곱도 ID 오름차순.
	want := []string{
		"bapjip", "myeon",
		"asia", "bunsik", "dak", "gogi", "hoe", "jungsik", "salad",
	}
	if len(ids) != len(want) {
		t.Fatalf("종류 차례 = %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("종류 차례 = %v, want %v", ids, want)
		}
	}
}
