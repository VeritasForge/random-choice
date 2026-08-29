package cuisine

import "testing"

func TestExtract(t *testing.T) {
	tests := []struct {
		name  string
		given string
		want  string
	}{
		{"네 단계면 앞의 두 단계만 남긴다", "음식점 > 한식 > 육류,고기 > 곱창,막창", "한식 > 육류,고기"},
		{"두 단계면 한 단계만 남는다", "음식점 > 분식", "분식"},
		{"세 단계면 두 단계가 남는다", "음식점 > 일식 > 돈까스", "일식 > 돈까스"},
		{"음식점만 있으면 남는 것이 없다", "음식점", ""},
		{"빈 문자열은 빈 문자열", "", ""},
		{"앞뒤 공백은 없앤다", "  음식점  >  한식  ", "한식"},
		{"음식점 접두어가 없어도 동작한다", "한식 > 육류,고기", "한식 > 육류,고기"},
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
