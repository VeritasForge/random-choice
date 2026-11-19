package stats

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestParseUnit(t *testing.T) {
	for _, s := range []string{"day", "week", "month"} {
		u, ok := ParseUnit(s)
		if !ok || string(u) != s {
			t.Errorf("ParseUnit(%q) = %q, %v", s, u, ok)
		}
	}
	for _, s := range []string{"", "year", "Day", "day; drop"} {
		if _, ok := ParseUnit(s); ok {
			t.Errorf("ParseUnit(%q)는 거부해야 한다", s)
		}
	}
	if Day.Span() != 30 || Week.Span() != 12 || Month.Span() != 12 {
		t.Error("칸 수가 일 30, 주 12, 월 12가 아니다")
	}
}

func TestIsVisitorID(t *testing.T) {
	cases := map[string]bool{
		"123e4567-e89b-12d3-a456-426614174000":  true,
		"123E4567-E89B-12D3-A456-426614174000":  false,
		"123e4567-e89b-12d3-a456-42661417400":   false,
		"123e4567-e89b-12d3-a456-4266141740000": false,
		"123e4567-e89b-12d3-a456-42661417400g":  false,
		"'; DROP TABLE visits;--":               false,
		"":                                      false,
	}
	for s, want := range cases {
		if got := IsVisitorID(s); got != want {
			t.Errorf("IsVisitorID(%q) = %v, want %v", s, got, want)
		}
	}
}

// openTx는 시험용 데이터베이스에 트랜잭션을 열고, 끝나면 되돌린다.
// 저장소는 풀 대신 이 트랜잭션 위에서 돈다.
func openTx(t *testing.T) (*PostgresStore, pgx.Tx) {
	t.Helper()
	url := os.Getenv("STATS_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("STATS_TEST_DATABASE_URL이 없어 건너뛴다")
	}
	ctx := context.Background()
	real, err := NewPostgresStore(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(real.Close)
	if err := real.ensureTable(ctx); err != nil {
		t.Fatal(err)
	}
	tx, err := real.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	s := &PostgresStore{db: tx}
	s.ready = true
	return s, tx
}

func TestBucketsUsesKoreanBoundaries(t *testing.T) {
	s, tx := openTx(t)
	ctx := context.Background()
	const (
		a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
		b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	)
	rows := []struct{ id, at string }{
		{a, "2001-01-16T15:30:00Z"},
		{a, "2001-01-17T02:00:00Z"},
		{b, "2001-01-16T14:59:00Z"},
		{b, "2001-01-14T14:59:00Z"},
		{c, "2001-01-14T15:00:00Z"},
		{c, "2000-12-31T14:59:00Z"},
	}
	for _, r := range rows {
		if _, err := tx.Exec(ctx, `INSERT INTO visits (visitor_id, visited_at) VALUES ($1, $2::timestamptz)`, r.id, r.at); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Date(2001, 1, 17, 3, 0, 0, 0, time.UTC)

	cases := []struct {
		unit Unit
		n    int
		tail []Bucket
	}{
		{Day, 30, []Bucket{{"2001-01-15", 1, 1}, {"2001-01-16", 1, 1}, {"2001-01-17", 1, 2}}},
		{Week, 12, []Bucket{{"2001-01-08", 1, 1}, {"2001-01-15", 3, 4}}},
		{Month, 12, []Bucket{{"2000-12-01", 1, 1}, {"2001-01-01", 3, 5}}},
	}
	for _, tc := range cases {
		got, err := s.Buckets(ctx, tc.unit, now)
		if err != nil {
			t.Fatalf("%s: %v", tc.unit, err)
		}
		if len(got) != tc.n {
			t.Fatalf("%s: 길이 %d, want %d", tc.unit, len(got), tc.n)
		}
		tail := got[len(got)-len(tc.tail):]
		for i, w := range tc.tail {
			if tail[i] != w {
				t.Errorf("%s: 뒤에서 %d번째 칸 %+v, want %+v", tc.unit, len(tc.tail)-i, tail[i], w)
			}
		}
	}
}

func TestRecordVisitStoresOneRow(t *testing.T) {
	s, tx := openTx(t)
	ctx := context.Background()
	const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	if err := s.RecordVisit(ctx, id); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM visits WHERE visitor_id = $1`, id).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("줄 수 %d, want 1", n)
	}
}
