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
	// 2로 정한 근거는 아직 가정이다. 1개면 "한식"·"중식" 수준이라 좁혀지지 않고,
	// 3개면 "한식 > 육류,고기 > 곱창,막창"처럼 잘게 쪼개져 후보가 전부
	// 1곳짜리가 될 것으로 보았다. 실제 카카오 분포로는 확인한 적이 없다.
	//
	// 열쇠를 받으면 먼저 확인할 것: 같은 상위 분류 아래에 2단계까지만 분류된 가게
	// ("한식")와 3단계 이상 가게("한식 > 육류,고기")가 섞여 나오는가.
	// 섞여 나오면 둘이 서로 다른 카드로 갈라져, 사용자가 "한식"을 골랐을 때
	// 고깃집이 다른 카드 뒤에 숨는다. 그때는 이 값을 다시 판단해야 한다.
	//
	// 이 값을 바꾸면 cuisine_test.go의 시험표도 함께 고쳐야 한다.
	maxDepth = 2
	// separator는 조각을 잇는 문자열이다. 화면도 이 형태를 그대로 보여준다.
	separator = " > "
)

// Tally 하나는 음식 종류 하나와 그 종류에 해당하는 가게 수다.
type Tally struct {
	Name  string
	Count int
}

// Extract는 카카오의 category_name을 음식 종류로 바꾼다.
// 예: "음식점 > 한식 > 육류,고기 > 곱창,막창" -> "한식 > 육류,고기"
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
