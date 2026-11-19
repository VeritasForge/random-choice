// Package stats는 방문을 익명으로 세는 곳이다.
// 저장하는 것은 익명 ID와 시각뿐이다. IP·브라우저 정보·위치·검색어, 카카오에서 온 것은 담지 않는다.
package stats

import "regexp"

// Unit은 방문을 묶는 단위다.
type Unit string

const (
	Day   Unit = "day"
	Week  Unit = "week"
	Month Unit = "month"
)

// ParseUnit은 "day"·"week"·"month"만 받는다. 그 밖은 ok=false.
func ParseUnit(s string) (Unit, bool) {
	switch u := Unit(s); u {
	case Day, Week, Month:
		return u, true
	}
	return "", false
}

// Span은 단위별로 보여 줄 칸 수다: Day 30, Week 12, Month 12.
func (u Unit) Span() int {
	if u == Day {
		return 30
	}
	return 12
}

// Bucket은 한 칸(하루·한 주·한 달)의 집계다.
type Bucket struct {
	Start    string `json:"start"`    // 칸이 시작하는 한국 날짜 "2006-01-02"
	Visitors int    `json:"visitors"` // 서로 다른 익명 ID 수
	Visits   int    `json:"visits"`   // 줄 수
}

var visitorIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// IsVisitorID는 소문자 UUID 꼴(8-4-4-4-12, 16진수)인지 본다.
func IsVisitorID(s string) bool {
	return visitorIDPattern.MatchString(s)
}
