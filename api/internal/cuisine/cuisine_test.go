package cuisine

import "testing"

func TestExtract(t *testing.T) {
	tests := []struct {
		name  string
		given string
		want  string
	}{
		{"네 단계여도 한 단계만 남긴다", "음식점 > 한식 > 육류,고기 > 곱창,막창", "한식"},
		{"두 단계면 한 단계만 남는다", "음식점 > 분식", "분식"},
		{"세 단계여도 한 단계만 남긴다", "음식점 > 일식 > 돈까스", "일식"},
		{"음식점만 있으면 남는 것이 없다", "음식점", ""},
		{"빈 문자열은 빈 문자열", "", ""},
		{"앞뒤 공백은 없앤다", "  음식점  >  한식  ", "한식"},
		{"음식점 접두어가 없어도 동작한다", "한식 > 육류,고기", "한식"},
		{"빈 조각은 건너뛴다", "음식점 >  > 분식", "분식"},
		{"구분자가 없으면 통째로 한 단계", "분식", "분식"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Extract(tt.given); got != tt.want {
				t.Errorf("Extract(%q) = %q, 원하는 값 %q", tt.given, got, tt.want)
			}
		})
	}
}

// 2026-09-02 실측(강남역 부근 반경 500m)에서 실제로 나온 사례다.
// "음식점 > 한식"인 가게와 "음식점 > 한식 > 육류,고기"인 가게가 같은 결과 안에
// 섞여 나왔는데, maxDepth=2에서는 각각 "한식"과 "한식 > 육류,고기"라는 서로 다른
// 카드로 갈라져 "한식"을 고른 사용자에게 고깃집이 보이지 않았다.
func TestExtractCollapsesShallowAndDeepIntoSameCategory(t *testing.T) {
	shallow := Extract("음식점 > 한식")
	deep := Extract("음식점 > 한식 > 육류,고기")
	if shallow != deep {
		t.Errorf("Extract(얕은 분류) = %q, Extract(깊은 분류) = %q — 같은 상위 카테고리인데 서로 다른 종류로 갈린다", shallow, deep)
	}
	if shallow != "한식" {
		t.Errorf("Extract(얕은 분류) = %q, 원하는 값 %q", shallow, "한식")
	}
}

func TestCountByName(t *testing.T) {
	got := CountByName([]string{"한식", "분식", "한식", "일식 > 돈까스", "분식", "한식"})
	want := []Tally{
		{Name: "한식", Count: 3},
		{Name: "분식", Count: 2},
		{Name: "일식 > 돈까스", Count: 1},
	}
	if len(got) != len(want) {
		t.Fatalf("길이가 %d, 원하는 길이 %d (%+v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%d번째가 %+v, 원하는 값 %+v", i, got[i], want[i])
		}
	}
}

func TestCountByNameSortsTiesByName(t *testing.T) {
	got := CountByName([]string{"중식", "분식", "양식"})
	want := []string{"분식", "양식", "중식"}
	for i := range want {
		if got[i].Name != want[i] {
			t.Errorf("%d번째가 %q, 원하는 값 %q (전체 %+v)", i, got[i].Name, want[i], got)
		}
	}
}

func TestCountByNameEmptyReturnsEmptySlice(t *testing.T) {
	got := CountByName(nil)
	if got == nil {
		t.Fatal("nil이 아니라 빈 슬라이스를 돌려줘야 한다. JSON으로 바꿀 때 null이 아닌 []가 나와야 하기 때문이다")
	}
	if len(got) != 0 {
		t.Errorf("길이가 %d, 원하는 길이 0", len(got))
	}
}
