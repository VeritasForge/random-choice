// Package cuisine은 카카오가 주는 분류 문자열을 우리 자체 음식 종류로 옮긴다.
//
// 왜 카카오 문자열을 그대로 쓰지 않는가:
//  1. 카카오는 분류 문자열의 저장을 금지한다. 우리 어휘의 식별자는 우리가 만든 것이라
//     저장할 수 있다(설계 문서 9절).
//  2. 카카오 분류를 맨 앞 한 조각만 쓰면 "한식" 한 장에 주변의 최대 47%가 몰린다.
//     두 조각을 쓰면 "한식"과 "한식 > 육류,고기"가 서로 다른 카드로 갈라진다.
//     우리 어휘로 옮기면 두 문제가 함께 풀린다.
package cuisine

import (
	"sort"
	"strings"
)

// rootCategory는 모든 음식점에 똑같이 붙는 맨 앞 조각이라 정보가 없다.
const rootCategory = "음식점"

// Cuisine 하나는 우리가 정의한 음식 종류다. 카카오 분류와 독립적이다.
type Cuisine struct {
	ID    string // 저장·대조에 쓰는 식별자. 카카오 데이터가 아니므로 저장해도 된다
	Label string // 화면에 보이는 이름
}

// DropReason은 가게를 결과에서 뺀 이유다.
//
// 둘을 나누는 이유: "점심 대상 아님"은 실측에서 14%였고 거의 매 요청마다 생기는
// 의도된 동작이다. "맞는 규칙 없음"은 실측 664곳 중 3곳뿐이었지만 우리 어휘에
// 구멍이 있다는 신호다. 한 숫자로 합치면 흔한 쪽이 드문 쪽을 덮어 버린다.
type DropReason int

const (
	DropNone     DropReason = iota // 뺀 것이 아니다
	DropNotLunch                   // 점심 대상이 아니다. 의도한 동작
	DropNoRule                     // 맞는 규칙이 없다. 어휘에 구멍이 있다는 신호
)

type rule struct {
	pattern []string // 음식점을 뗀 뒤의 조각들과 앞에서부터 맞춰 본다
	cuisine Cuisine  // ID가 비어 있으면 점심 대상이 아니라는 뜻이다
}

// rules는 우리 어휘 전체다. 이 목록이 카카오와 우리를 가르는 경계다.
//
// **순서가 규칙의 일부다.** 위에서부터 맞춰 보고 가장 먼저 맞는 것을 쓰므로,
// 조각이 긴 규칙이 짧은 규칙보다 앞에 있어야 한다. 어기면 뒤의 규칙이 영영
// 쓰이지 않는 죽은 코드가 된다 — cuisine_test.go가 그것을 지킨다.
//
// 규칙과 맞춘 뒤 남는 조각은 보지 않는다. 그 자리에 오는 것은 대개 브랜드명
// (파리바게뜨·맥도날드·죠스떡볶이)이라 종류를 가르는 데 쓸모가 없다.
var rules = []rule{
	// 점심이 아닌 것. 판정 기준은 "이것만 먹고 점심을 때울 수 있는가" 하나다.
	// 술집을 통째로 빼는 이유: 실측에서 14%였고 그 안에 위스키온더락·칵테일바가 있다.
	// 낮에 위스키바를 권하면 그 한 번으로 신뢰가 무너진다.
	{[]string{"술집"}, Cuisine{}},
	{[]string{"간식", "아이스크림"}, Cuisine{}},
	{[]string{"간식", "도넛"}, Cuisine{}},
	{[]string{"간식", "떡,한과"}, Cuisine{}},

	// 한식을 쪼갠다. 지금 한 장에 최대 47%가 몰려 있던 자리다.
	{[]string{"한식", "육류,고기", "닭요리"}, Cuisine{"dak", "닭요리"}},
	{[]string{"한식", "육류,고기"}, Cuisine{"gogi", "고기·구이"}},
	{[]string{"한식", "해물,생선"}, Cuisine{"hoe", "회·해물"}},
	{[]string{"한식", "국수"}, Cuisine{"myeon", "면·국수"}},
	{[]string{"한식", "냉면"}, Cuisine{"myeon", "면·국수"}},
	{[]string{"한식", "국밥"}, Cuisine{"gukbap", "국밥·탕"}},
	{[]string{"한식", "감자탕"}, Cuisine{"gukbap", "국밥·탕"}},
	{[]string{"한식", "순대"}, Cuisine{"gukbap", "국밥·탕"}},
	{[]string{"한식", "찌개,전골"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"한식", "한정식"}, Cuisine{"bapjip", "밥집·백반"}},
	// 하위가 없는 한식은 정보가 없는 것이 아니라 그 자체가 한 종류다.
	// 실측에서 이 그룹의 상호는 오맛난집·미진식당·봉된장·수미정이었다.
	{[]string{"한식"}, Cuisine{"bapjip", "밥집·백반"}},

	// 나머지 갈래
	{[]string{"일식", "돈까스,우동"}, Cuisine{"donkatsu", "돈까스·우동"}},
	{[]string{"일식", "일본식라면"}, Cuisine{"myeon", "면·국수"}},
	{[]string{"일식"}, Cuisine{"ilsik", "일식·초밥"}},
	{[]string{"중식"}, Cuisine{"jungsik", "중식"}},
	{[]string{"분식"}, Cuisine{"bunsik", "분식"}},
	{[]string{"치킨"}, Cuisine{"dak", "닭요리"}},
	{[]string{"양식", "햄버거"}, Cuisine{"burger", "햄버거"}},
	{[]string{"양식"}, Cuisine{"yangsik", "양식·파스타"}},
	{[]string{"패스트푸드", "샌드위치"}, Cuisine{"salad", "샐러드·샌드위치"}},
	{[]string{"패스트푸드"}, Cuisine{"burger", "햄버거"}},
	{[]string{"샐러드"}, Cuisine{"salad", "샐러드·샌드위치"}},
	{[]string{"아시아음식"}, Cuisine{"asia", "아시아 음식"}},
	{[]string{"샤브샤브"}, Cuisine{"shabu", "샤브샤브"}},
	{[]string{"퓨전요리"}, Cuisine{"fusion", "퓨전"}},
	{[]string{"도시락"}, Cuisine{"dosirak", "도시락"}},
	{[]string{"뷔페"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"구내식당"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"기사식당"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"패밀리레스토랑"}, Cuisine{"yangsik", "양식·파스타"}},
	// 빵집은 샌드위치·샐러드도 팔아 점심이 되지만, 아이스크림 한 통은 점심이 아니다.
	// 그래서 위에서 아이스크림·도넛·떡한과를 먼저 뺀 뒤 나머지 간식만 남긴다.
	{[]string{"간식"}, Cuisine{"bbang", "빵·간식"}},
}

func segments(categoryName string) []string {
	var segs []string
	for _, part := range strings.Split(categoryName, ">") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			segs = append(segs, trimmed)
		}
	}
	if len(segs) > 0 && segs[0] == rootCategory {
		segs = segs[1:]
	}
	return segs
}

// ClassifyWithReason은 카카오 분류 문자열을 우리 어휘로 옮긴다.
// 점심 대상이 아니거나 맞는 규칙이 없으면 ok가 false이고, 그때 왜 뺐는지를
// DropReason으로 함께 돌려준다 — 부르는 쪽이 이유별로 따로 세도록.
func ClassifyWithReason(categoryName string) (Cuisine, bool, DropReason) {
	segs := segments(categoryName)
	for _, r := range rules {
		if len(r.pattern) > len(segs) {
			continue
		}
		matched := true
		for i, seg := range r.pattern {
			if segs[i] != seg {
				matched = false
				break
			}
		}
		if !matched {
			continue
		}
		if r.cuisine.ID == "" {
			return Cuisine{}, false, DropNotLunch
		}
		return r.cuisine, true, DropNone
	}
	return Cuisine{}, false, DropNoRule
}

// Tally 하나는 음식 종류 하나와 그 종류에 해당하는 가게 수다.
type Tally struct {
	Cuisine Cuisine
	Count   int
}

// CountBy는 음식 종류별 가게 수를 센다.
// 가게 수가 많은 순으로, 같으면 식별자 오름차순으로 정렬한다 —
// 같은 입력이면 언제나 같은 순서가 나와야 시험할 수 있기 때문이다.
func CountBy(cuisines []Cuisine) []Tally {
	counts := make(map[Cuisine]int, len(cuisines))
	for _, c := range cuisines {
		counts[c]++
	}
	tallies := make([]Tally, 0, len(counts))
	for c, n := range counts {
		tallies = append(tallies, Tally{Cuisine: c, Count: n})
	}
	sort.Slice(tallies, func(i, j int) bool {
		if tallies[i].Count != tallies[j].Count {
			return tallies[i].Count > tallies[j].Count
		}
		return tallies[i].Cuisine.ID < tallies[j].Cuisine.ID
	})
	return tallies
}
