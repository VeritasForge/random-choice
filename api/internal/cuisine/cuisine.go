// Package cuisine은 카카오가 주는 분류 문자열을 사람이 읽는 음식 종류로 바꾼다.
package cuisine

import (
	"sort"
	"strings"
)

const (
	// rootCategory는 모든 음식점에 똑같이 붙는 맨 앞 조각이라 정보가 없다.
	rootCategory = "음식점"
	// maxDepth는 음식 종류로 남길 조각 수다.
	//
	// 2026-09-02 실측(강남역 부근 반경 500m)으로 이전에 2로 뒀던 근거가 틀렸음이
	// 확인됐다. 카카오 원본 문자열이 "음식점 > 한식"인 가게와
	// "음식점 > 한식 > 육류,고기"인 가게가 같은 결과 안에 섞여 나왔고, 2였을 때는
	// 각각 "한식"과 "한식 > 육류,고기"라는 서로 다른 카드로 갈라져 "한식"을 고른
	// 사용자에게 고깃집이 보이지 않았다(총 23개 종류 중 한식·분식·중식·아시아음식·
	// 간식·패스트푸드 6개 그룹에서 같은 문제가 났다). 1로 낮추면 이 문제는 없어지되,
	// "한식"·"중식" 수준까지만 좁혀진다 — 실측에서는 반경 500m 기준으로 그 정도도
	// 카드 하나에 최대 9곳(총 45곳 중) 수준이라 지나치게 뭉치지는 않았다.
	//
	// 이 값을 바꾸면 cuisine_test.go의 시험표도 함께 고쳐야 한다.
	maxDepth = 1
	// separator는 조각을 잇는 문자열이다. 화면도 이 형태를 그대로 보여준다.
	separator = " > "
)

// Tally 하나는 음식 종류 하나와 그 종류에 해당하는 가게 수다.
type Tally struct {
	Name  string
	Count int
}

// Extract는 카카오의 category_name을 음식 종류로 바꾼다.
// 예: "음식점 > 한식 > 육류,고기 > 곱창,막창" -> "한식"
// 남는 조각이 없으면 빈 문자열을 돌려준다. 부르는 쪽은 이때 그 가게를 결과에서 뺀다.
func Extract(categoryName string) string {
	var segments []string
	for _, part := range strings.Split(categoryName, ">") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			segments = append(segments, trimmed)
		}
	}
	if len(segments) > 0 && segments[0] == rootCategory {
		segments = segments[1:]
	}
	if len(segments) == 0 {
		return ""
	}
	if len(segments) > maxDepth {
		segments = segments[:maxDepth]
	}
	return strings.Join(segments, separator)
}

// CountByName은 음식 종류별 가게 수를 센다.
// 가게 수가 많은 순으로, 같으면 이름 오름차순으로 정렬한다 —
// 같은 입력이면 언제나 같은 순서가 나와야 시험할 수 있기 때문이다.
func CountByName(cuisines []string) []Tally {
	counts := make(map[string]int, len(cuisines))
	for _, name := range cuisines {
		counts[name]++
	}
	tallies := make([]Tally, 0, len(counts))
	for name, count := range counts {
		tallies = append(tallies, Tally{Name: name, Count: count})
	}
	sort.Slice(tallies, func(i, j int) bool {
		if tallies[i].Count != tallies[j].Count {
			return tallies[i].Count > tallies[j].Count
		}
		return tallies[i].Name < tallies[j].Name
	})
	return tallies
}
