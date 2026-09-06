package geo

import (
	"math"
	"testing"
)

// 카카오가 준 거리와 우리 계산이 맞는지 실측으로 대조했다(2026-09-06).
// 강남역(37.4979, 127.0276)에서 북쪽 400m 지점으로 조회했을 때,
// 카카오는 '소보키 강남점'까지 24m라고 답했고 우리 계산도 25m였다.
// 같은 가게를 사용자 원위치에서 재면 412m다 — 이 차이가 이 패키지가 있는 이유다.
func TestDistanceMeters(t *testing.T) {
	tests := []struct {
		name                   string
		lat1, lng1, lat2, lng2 float64
		want                   float64
		tolerance              float64
	}{
		{"같은 점은 0", 37.4979, 127.0276, 37.4979, 127.0276, 0, 0.01},
		{"북쪽 400m", 37.4979, 127.0276, 37.4979 + 400/111320.0, 127.0276, 400, 1},
		{"강남역에서 소보키 강남점", 37.4979, 127.0276, 37.50151, 127.02785, 402, 15},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DistanceMeters(tt.lat1, tt.lng1, tt.lat2, tt.lng2)
			if math.Abs(got-tt.want) > tt.tolerance {
				t.Errorf("DistanceMeters = %.1fm, want %.1fm ± %.1f", got, tt.want, tt.tolerance)
			}
		})
	}
}

// 거리는 방향을 바꿔도 같아야 한다. 아니면 어느 쪽을 넣느냐에 따라 답이 달라진다.
func TestDistanceIsSymmetric(t *testing.T) {
	a := DistanceMeters(37.4979, 127.0276, 37.5563, 126.9236)
	b := DistanceMeters(37.5563, 126.9236, 37.4979, 127.0276)
	if math.Abs(a-b) > 0.01 {
		t.Errorf("방향에 따라 거리가 다르다: %.3f vs %.3f", a, b)
	}
}

func TestOffset(t *testing.T) {
	const lat, lng = 37.4979, 127.0276

	t.Run("북쪽으로 옮기면 위도만 커진다", func(t *testing.T) {
		gotLat, gotLng := Offset(lat, lng, 400, 0)
		if gotLat <= lat {
			t.Errorf("위도가 커지지 않았다: %f -> %f", lat, gotLat)
		}
		if math.Abs(gotLng-lng) > 1e-9 {
			t.Errorf("경도가 움직였다: %f -> %f", lng, gotLng)
		}
		if d := DistanceMeters(lat, lng, gotLat, gotLng); math.Abs(d-400) > 1 {
			t.Errorf("옮긴 거리 = %.1fm, want 400m", d)
		}
	})

	t.Run("동쪽으로 옮기면 경도만 커진다", func(t *testing.T) {
		gotLat, gotLng := Offset(lat, lng, 0, 400)
		if gotLng <= lng {
			t.Errorf("경도가 커지지 않았다: %f -> %f", lng, gotLng)
		}
		if math.Abs(gotLat-lat) > 1e-9 {
			t.Errorf("위도가 움직였다: %f -> %f", lat, gotLat)
		}
		if d := DistanceMeters(lat, lng, gotLat, gotLng); math.Abs(d-400) > 1 {
			t.Errorf("옮긴 거리 = %.1fm, want 400m", d)
		}
	})

	t.Run("음수는 반대 방향", func(t *testing.T) {
		southLat, _ := Offset(lat, lng, -400, 0)
		if southLat >= lat {
			t.Errorf("남쪽으로 가지 않았다: %f -> %f", lat, southLat)
		}
	})

	// 경도 1도의 실제 거리는 위도에 따라 다르다. 위도를 무시하면 북쪽으로 갈수록
	// 동서 이동 거리가 커져, 서울에서 400m를 요청해도 500m 넘게 옮겨진다.
	t.Run("위도가 높을수록 같은 경도 차이가 짧은 거리다", func(t *testing.T) {
		_, seoulLng := Offset(37.5, 127.0, 0, 400)
		_, jejuLng := Offset(33.5, 126.5, 0, 400)
		seoulDelta := seoulLng - 127.0
		jejuDelta := jejuLng - 126.5
		if seoulDelta <= jejuDelta {
			t.Errorf("위도 보정이 없다: 서울 %g, 제주 %g", seoulDelta, jejuDelta)
		}
	})
}
