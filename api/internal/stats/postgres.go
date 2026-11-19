package stats

// 이 서버가 처음으로 들이는 외부 라이브러리가 pgx다.
// 표준 라이브러리에는 Postgres 드라이버가 없고, pgx는 연결 풀(pgxpool)을 함께 준다.

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 문장이 둘(CREATE TABLE, CREATE INDEX)인데 Exec 한 번에 보낸다. 단순 프로토콜이라 가능하다.
// NewPostgresStore의 QueryExecMode를 바꾸면 여러 문장 Exec가 실패하므로, 그때는 두 번의 호출로 나눠야 한다.
const createTableSQL = `
CREATE TABLE IF NOT EXISTS visits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id uuid        NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_visited_at_idx ON visits (visited_at);`

const bucketsSQL = `
WITH bounds AS (
  SELECT date_trunc($1::text, $3::timestamptz AT TIME ZONE 'Asia/Seoul') AS last
), series AS (
  SELECT generate_series(last - ($2::int - 1) * ('1 ' || $1::text)::interval,
                         last, ('1 ' || $1::text)::interval) AS start
  FROM bounds
)
SELECT to_char(s.start, 'YYYY-MM-DD'), count(DISTINCT v.visitor_id), count(v.visitor_id)
FROM series s
LEFT JOIN visits v
  ON v.visited_at >= (s.start AT TIME ZONE 'Asia/Seoul')
 AND v.visited_at <  ((s.start + ('1 ' || $1::text)::interval) AT TIME ZONE 'Asia/Seoul')
GROUP BY s.start ORDER BY s.start;`

// querier는 저장소가 데이터베이스에 바라는 최소한이다.
// *pgxpool.Pool과 pgx.Tx가 둘 다 만족해서, 시험은 트랜잭션 위에서 돌리고 되돌린다.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// PostgresStore는 방문을 Postgres에 넣고 센다.
type PostgresStore struct {
	pool *pgxpool.Pool
	db   querier

	mu    sync.Mutex
	ready bool // 테이블을 만들었는지
}

// NewPostgresStore는 주소 문법만 검사한다. 연결은 첫 사용 때 맺는다.
// 데이터베이스가 잠들어 있어도 서버가 뜨게 하기 위해서다.
func NewPostgresStore(databaseURL string) (*PostgresStore, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("데이터베이스 주소를 읽지 못했다: %w", err)
	}
	cfg.MaxConns = 2
	// 연결 주소는 PgBouncer(연결 중계기)를 거치는 풀링 주소다.
	// PgBouncer는 연결마다 준비된 문장(prepared statement)을 기억하지 못하므로,
	// 문장을 준비하지 않고 보내는 단순 프로토콜을 쓴다.
	// 이 모드를 바꾸면 createTableSQL의 여러 문장 Exec도 나눠야 한다.
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg) // 연결은 하지 않는다
	if err != nil {
		return nil, fmt.Errorf("연결 풀을 만들지 못했다: %w", err)
	}
	return &PostgresStore{pool: pool, db: pool}, nil
}

// Close는 연결 풀을 닫는다.
func (s *PostgresStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// ensureTable은 테이블을 첫 사용 때 한 번 만든다. 실패하면 다음 호출에서 다시 시도한다.
func (s *PostgresStore) ensureTable(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ready {
		return nil
	}
	if _, err := s.db.Exec(ctx, createTableSQL); err != nil {
		return fmt.Errorf("방문 테이블을 만들지 못했다: %w", err)
	}
	s.ready = true
	return nil
}

// RecordVisit은 방문 한 줄을 넣는다. 시각은 데이터베이스가 찍는다.
func (s *PostgresStore) RecordVisit(ctx context.Context, visitorID string) error {
	if err := s.ensureTable(ctx); err != nil {
		return err
	}
	if _, err := s.db.Exec(ctx, `INSERT INTO visits (visitor_id) VALUES ($1)`, visitorID); err != nil {
		return fmt.Errorf("방문을 기록하지 못했다: %w", err)
	}
	return nil
}

// Buckets는 now가 속한 칸까지 unit.Span()개를 오래된 칸부터 돌려준다.
// 방문이 없는 칸도 0으로 나온다.
func (s *PostgresStore) Buckets(ctx context.Context, unit Unit, now time.Time) ([]Bucket, error) {
	if err := s.ensureTable(ctx); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, bucketsSQL, string(unit), unit.Span(), now)
	if err != nil {
		return nil, fmt.Errorf("방문 수를 세지 못했다: %w", err)
	}
	defer rows.Close()
	out := make([]Bucket, 0, unit.Span())
	for rows.Next() {
		var b Bucket
		if err := rows.Scan(&b.Start, &b.Visitors, &b.Visits); err != nil {
			return nil, fmt.Errorf("방문 수를 읽지 못했다: %w", err)
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("방문 수를 읽지 못했다: %w", err)
	}
	return out, nil
}
