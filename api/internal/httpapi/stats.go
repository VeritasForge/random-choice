package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/stats"
)

const (
	// maxVisitBodyBytes는 방문 본문의 상한이다. 올바른 본문은 60바이트 남짓이라
	// 256이면 넉넉하고, 그보다 큰 것은 읽지도 않고 버린다.
	maxVisitBodyBytes = 256
	// storeTimeout은 저장소를 한 번 부르는 데 기다리는 상한이다.
	storeTimeout = 5 * time.Second
)

// VisitStore는 방문을 넣고 세어 주는 무언가다.
// 실제로는 stats.PostgresStore가, 시험에서는 가짜가 들어간다.
type VisitStore interface {
	RecordVisit(ctx context.Context, visitorID string) error
	Buckets(ctx context.Context, unit stats.Unit, now time.Time) ([]stats.Bucket, error)
}

type options struct {
	visits VisitStore
}

// Option은 NewHandler에 덧붙이는 선택 설정이다.
type Option func(*options)

// WithVisitStore는 방문 저장소를 붙인다. 붙이지 않으면 방문·통계 경로는
// not_configured(503)로 답한다 — 연결 주소가 없어도 서버는 떠야 하기 때문이다.
func WithVisitStore(store VisitStore) Option {
	return func(o *options) { o.visits = store }
}

type visitRequest struct {
	VisitorID string `json:"visitorId"`
}

type statsResponse struct {
	Unit    stats.Unit     `json:"unit"`
	Buckets []stats.Bucket `json:"buckets"`
}

// handleVisit은 방문 한 건을 받아 저장소에 넘긴다.
// 읽는 것은 본문의 익명 ID 하나뿐이다. IP·User-Agent 같은 요청의 다른 정보는
// 저장소가 아무것도 담지 않기로 한 약속에 따라 건드리지 않는다.
func handleVisit(w http.ResponseWriter, r *http.Request, store VisitStore) {
	var req visitRequest
	body := http.MaxBytesReader(w, r.Body, maxVisitBodyBytes)
	if err := json.NewDecoder(body).Decode(&req); err != nil || !stats.IsVisitorID(req.VisitorID) {
		// 읽다 만 본문이 남아 있어도 연결을 재사용할 수 있도록 나머지를 버린다.
		_, _ = io.Copy(io.Discard, body)
		writeError(w, http.StatusBadRequest, "invalid_visitor",
			"방문자 ID가 올바르지 않습니다.")
		return
	}

	// 잘못된 요청을 먼저 가리고 서버 설정을 본다. handleNearby와 같은 순서다.
	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "not_configured",
			"방문 저장소가 설정되지 않았습니다.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), storeTimeout)
	defer cancel()
	if err := store.RecordVisit(ctx, req.VisitorID); err != nil {
		// 원인은 로그에만 남긴다. 응답에 실으면 저장소 주소 같은 내부 정보가 새어 나간다.
		// 방문자 ID도 로그에 남기지 않는다.
		slog.Error("방문을 저장하지 못했습니다", "error", err)
		writeError(w, http.StatusInternalServerError, "storage_error",
			"방문을 저장하지 못했습니다.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleStats는 방문 수를 일·주·월 단위로 묶어 오래된 칸부터 준다. unit이 없으면 day다.
func handleStats(w http.ResponseWriter, r *http.Request, store VisitStore) {
	raw := r.URL.Query().Get("unit")
	if raw == "" {
		raw = string(stats.Day)
	}
	unit, ok := stats.ParseUnit(raw)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_unit",
			"단위는 day, week, month 중 하나여야 합니다.")
		return
	}

	if store == nil {
		writeError(w, http.StatusServiceUnavailable, "not_configured",
			"방문 저장소가 설정되지 않았습니다.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), storeTimeout)
	defer cancel()
	buckets, err := store.Buckets(ctx, unit, time.Now())
	if err != nil {
		slog.Error("통계를 읽지 못했습니다", "error", err, "unit", unit)
		writeError(w, http.StatusInternalServerError, "storage_error",
			"통계를 읽지 못했습니다.")
		return
	}
	if buckets == nil {
		// null이 아니라 빈 배열로 나가야 화면이 그대로 돈다.
		buckets = []stats.Bucket{}
	}
	writeJSON(w, http.StatusOK, statsResponse{Unit: unit, Buckets: buckets})
}
