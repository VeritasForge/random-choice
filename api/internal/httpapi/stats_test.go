package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/stats"
)

const validVisitorID = "123e4567-e89b-42d3-a456-426614174000"

// fakeVisitStore는 데이터베이스 대신 미리 정해 둔 답을 돌려준다.
// 비밀값·형식 검사가 "저장소를 부르기 전에 막았는가"를 보려면 불린 횟수를 세야 한다.
type fakeVisitStore struct {
	buckets     []stats.Bucket
	err         error
	recorded    []string
	bucketCalls int
	gotUnit     stats.Unit
}

func (f *fakeVisitStore) RecordVisit(_ context.Context, visitorID string) error {
	f.recorded = append(f.recorded, visitorID)
	return f.err
}

func (f *fakeVisitStore) Buckets(_ context.Context, unit stats.Unit, _ time.Time) ([]stats.Bucket, error) {
	f.bucketCalls++
	f.gotUnit = unit
	return f.buckets, f.err
}

func postVisit(t *testing.T, handler http.Handler, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/visits", strings.NewReader(body))
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func visitBody(id string) string { return `{"visitorId":"` + id + `"}` }

func TestVisitsStoresVisitorID(t *testing.T) {
	store := &fakeVisitStore{}
	rec := postVisit(t, NewHandler(nil, nil, "", WithVisitStore(store)), visitBody(validVisitorID), nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("상태 = %d, want 200 (본문: %s)", rec.Code, rec.Body.String())
	}
	if strings.TrimSpace(rec.Body.String()) != `{"ok":true}` {
		t.Errorf("본문 = %q", rec.Body.String())
	}
	if len(store.recorded) != 1 || store.recorded[0] != validVisitorID {
		t.Errorf("저장소가 받은 ID = %v, want [%s]", store.recorded, validVisitorID)
	}
}

func TestVisitsRejectsBadBodies(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{"JSON이 아님", "not json"},
		{"빈 객체", `{}`},
		{"짧은 문자열", `{"visitorId":"abc"}`},
		{"대문자 UUID", visitBody(strings.ToUpper(validVisitorID))},
		{"SQL 조각", `{"visitorId":"'; DROP TABLE visits;--"}`},
		{"256바이트 초과", `{"visitorId":"` + strings.Repeat("a", 300) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeVisitStore{}
			rec := postVisit(t, NewHandler(nil, nil, "", WithVisitStore(store)), tt.body, nil)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("상태 = %d, want 400", rec.Code)
			}
			if got := decodeError(t, rec)["error"]; got != "invalid_visitor" {
				t.Errorf("error = %q, want invalid_visitor", got)
			}
			if len(store.recorded) != 0 {
				t.Errorf("저장소가 %d번 불렸다, want 0", len(store.recorded))
			}
		})
	}
}

func TestVisitsRequiresInternalKey(t *testing.T) {
	store := &fakeVisitStore{}
	handler := NewHandler(nil, nil, "secret", WithVisitStore(store))

	rec := postVisit(t, handler, visitBody(validVisitorID), nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("상태 = %d, want 401", rec.Code)
	}
	if len(store.recorded) != 0 {
		t.Errorf("저장소가 %d번 불렸다, want 0", len(store.recorded))
	}

	rec = postVisit(t, handler, visitBody(validVisitorID), map[string]string{internalKeyHeader: "secret"})
	if rec.Code != http.StatusOK {
		t.Errorf("올바른 열쇠인데 상태 = %d, want 200", rec.Code)
	}
}

func TestStatsRequiresInternalKey(t *testing.T) {
	store := &fakeVisitStore{}
	rec := get(t, NewHandler(nil, nil, "secret", WithVisitStore(store)), "/api/v1/stats")

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("상태 = %d, want 401", rec.Code)
	}
	if store.bucketCalls != 0 {
		t.Errorf("저장소가 %d번 불렸다, want 0", store.bucketCalls)
	}
}

func TestVisitsWithoutStoreIsNotConfigured(t *testing.T) {
	rec := postVisit(t, NewHandler(nil, nil, ""), visitBody(validVisitorID), nil)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("상태 = %d, want 503", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "not_configured" {
		t.Errorf("error = %q, want not_configured", got)
	}
}

func TestStatsWithoutStoreIsNotConfigured(t *testing.T) {
	rec := get(t, NewHandler(nil, nil, ""), "/api/v1/stats")

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("상태 = %d, want 503", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "not_configured" {
		t.Errorf("error = %q, want not_configured", got)
	}
}

func TestVisitsStoreFailureIs500(t *testing.T) {
	store := &fakeVisitStore{err: errors.New("connection refused to db.internal:5432")}
	rec := postVisit(t, NewHandler(nil, nil, "", WithVisitStore(store)), visitBody(validVisitorID), nil)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("상태 = %d, want 500", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "storage_error" {
		t.Errorf("error = %q, want storage_error", got)
	}
	if strings.Contains(rec.Body.String(), "db.internal") {
		t.Errorf("본문에 저장소 오류 원인이 새었다: %s", rec.Body.String())
	}
}

func TestStatsStoreFailureIs500(t *testing.T) {
	store := &fakeVisitStore{err: errors.New("connection refused to db.internal:5432")}
	rec := get(t, NewHandler(nil, nil, "", WithVisitStore(store)), "/api/v1/stats")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("상태 = %d, want 500", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "storage_error" {
		t.Errorf("error = %q, want storage_error", got)
	}
	if strings.Contains(rec.Body.String(), "db.internal") {
		t.Errorf("본문에 저장소 오류 원인이 새었다: %s", rec.Body.String())
	}
}

func TestStatsReturnsBuckets(t *testing.T) {
	store := &fakeVisitStore{buckets: []stats.Bucket{
		{Start: "2026-11-09", Visitors: 3, Visits: 4},
		{Start: "2026-11-16", Visitors: 5, Visits: 8},
	}}
	rec := get(t, NewHandler(nil, nil, "", WithVisitStore(store)), "/api/v1/stats?unit=week")

	if rec.Code != http.StatusOK {
		t.Fatalf("상태 = %d, want 200 (본문: %s)", rec.Code, rec.Body.String())
	}
	if store.gotUnit != stats.Week {
		t.Errorf("저장소가 받은 단위 = %q, want week", store.gotUnit)
	}
	var got struct {
		Unit    string         `json:"unit"`
		Buckets []stats.Bucket `json:"buckets"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("응답을 해석하지 못했다: %v", err)
	}
	if got.Unit != "week" || len(got.Buckets) != 2 || got.Buckets[0] != store.buckets[0] || got.Buckets[1] != store.buckets[1] {
		t.Errorf("응답 = %+v", got)
	}
	if !strings.Contains(rec.Body.String(), `"start":"2026-11-09","visitors":3,"visits":4`) {
		t.Errorf("JSON 이름이 약속과 다르다: %s", rec.Body.String())
	}
}

func TestStatsDefaultsToDay(t *testing.T) {
	store := &fakeVisitStore{}
	rec := get(t, NewHandler(nil, nil, "", WithVisitStore(store)), "/api/v1/stats")

	if rec.Code != http.StatusOK {
		t.Fatalf("상태 = %d, want 200", rec.Code)
	}
	if store.gotUnit != stats.Day {
		t.Errorf("저장소가 받은 단위 = %q, want day", store.gotUnit)
	}
}

func TestStatsRejectsUnknownUnit(t *testing.T) {
	store := &fakeVisitStore{}
	rec := get(t, NewHandler(nil, nil, "", WithVisitStore(store)), "/api/v1/stats?unit=year")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("상태 = %d, want 400", rec.Code)
	}
	if got := decodeError(t, rec)["error"]; got != "invalid_unit" {
		t.Errorf("error = %q, want invalid_unit", got)
	}
	if store.bucketCalls != 0 {
		t.Errorf("저장소가 %d번 불렸다, want 0", store.bucketCalls)
	}
}

func TestNearbyStillWorksWithoutStore(t *testing.T) {
	rec := get(t, NewHandler(&fakeFinder{}, &fakeSpots{}, ""), "/api/v1/nearby?lat=37.5&lng=127.0")

	if rec.Code != http.StatusOK {
		t.Fatalf("상태 = %d, want 200 (본문: %s)", rec.Code, rec.Body.String())
	}
}
