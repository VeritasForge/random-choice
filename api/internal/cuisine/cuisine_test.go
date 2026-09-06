package cuisine

import "testing"

// 실제 카카오 응답에서 뽑은 문자열들이다. 2026-09-06에 네 지역 889곳을 조회해 확인했다.
func TestClassify(t *testing.T) {
	tests := []struct {
		name     string
		category string
		wantID   string
		wantOK   bool
	}{
		// 한식이 뭉치던 문제를 푸는 자리. 여기가 이 작업의 핵심이다.
		{"하위가 없는 한식은 밥집", "음식점 > 한식", "bapjip", true},
		{"찌개도 밥집", "음식점 > 한식 > 찌개,전골", "bapjip", true},
		{"육류고기는 고기구이", "음식점 > 한식 > 육류,고기", "gogi", true},
		{"곱창도 고기구이", "음식점 > 한식 > 육류,고기 > 곱창,막창", "gogi", true},
		{"닭요리는 고기구이가 아니다", "음식점 > 한식 > 육류,고기 > 닭요리", "dak", true},
		{"삼계탕도 닭요리", "음식점 > 한식 > 육류,고기 > 닭요리 > 삼계탕", "dak", true},
		{"치킨도 닭요리", "음식점 > 치킨", "dak", true},
		{"해물생선은 회해물", "음식점 > 한식 > 해물,생선", "hoe", true},
		{"국수는 면국수", "음식점 > 한식 > 국수", "myeon", true},
		{"냉면도 면국수", "음식점 > 한식 > 냉면", "myeon", true},
		{"일본식라면도 면국수", "음식점 > 일식 > 일본식라면", "myeon", true},
		{"국밥은 국밥탕", "음식점 > 한식 > 국밥", "gukbap", true},
		{"감자탕도 국밥탕", "음식점 > 한식 > 감자탕", "gukbap", true},

		// 나머지 갈래
		{"돈까스우동은 따로", "음식점 > 일식 > 돈까스,우동", "donkatsu", true},
		{"초밥은 일식", "음식점 > 일식 > 초밥,롤", "ilsik", true},
		{"하위가 없는 일식", "음식점 > 일식", "ilsik", true},
		{"중국요리는 중식", "음식점 > 중식 > 중국요리", "jungsik", true},
		{"햄버거는 따로", "음식점 > 양식 > 햄버거", "burger", true},
		{"패스트푸드도 햄버거", "음식점 > 패스트푸드 > 맥도날드", "burger", true},
		{"샌드위치는 샐러드쪽", "음식점 > 패스트푸드 > 샌드위치 > 써브웨이", "salad", true},
		{"이탈리안은 양식", "음식점 > 양식 > 이탈리안", "yangsik", true},
		{"베트남음식은 아시아", "음식점 > 아시아음식 > 동남아음식 > 베트남음식", "asia", true},
		{"제과베이커리는 빵간식", "음식점 > 간식 > 제과,베이커리", "bbang", true},
		{"브랜드명이 붙어도 같다", "음식점 > 간식 > 제과,베이커리 > 파리바게뜨", "bbang", true},
		{"구내식당은 밥집", "음식점 > 구내식당", "bapjip", true},

		// 점심 대상이 아닌 것
		{"술집은 뺀다", "음식점 > 술집", "", false},
		{"칵테일바도 뺀다", "음식점 > 술집 > 칵테일바", "", false},
		{"호프요리주점도 뺀다", "음식점 > 술집 > 호프,요리주점", "", false},
		{"아이스크림은 점심이 아니다", "음식점 > 간식 > 아이스크림", "", false},
		{"떡한과도 점심이 아니다", "음식점 > 간식 > 떡,한과", "", false},

		// 규칙이 없는 것
		{"하위가 없으면 종류를 알 수 없다", "음식점", "", false},
		{"빈 문자열", "", "", false},
		{"모르는 분류", "음식점 > 우주음식", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := Classify(tt.category)
			if ok != tt.wantOK {
				t.Fatalf("Classify(%q) ok = %v, want %v", tt.category, ok, tt.wantOK)
			}
			if got.ID != tt.wantID {
				t.Errorf("Classify(%q) ID = %q, want %q", tt.category, got.ID, tt.wantID)
			}
			if tt.wantOK && got.Label == "" {
				t.Errorf("Classify(%q)가 빈 이름을 돌려줬다. 화면에 글자 없는 카드가 그려진다", tt.category)
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
