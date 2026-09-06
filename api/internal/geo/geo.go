// Package geo는 좌표 계산만 한다. 바깥과 닿지 않는 순수 계산이다.
//
// 이 패키지가 있는 이유: 조회 지점을 사용자 위치 밖으로 옮기면 카카오가 주는 거리가
// 사용자 기준이 아니게 된다. 2026-09-06 실측에서 400m 옮긴 지점으로 조회하니
// 카카오는 24m라고 답했지만 사용자 원위치에서는 412m였다 — 17배 차이다.
// 그 값을 그대로 화면에 쓰면 "너무 멀어"라는 불만을 우리가 직접 만든다.
package geo

import "math"

// earthRadiusM은 지구 반지름(미터)이다. 국제 측지 기준의 평균값을 쓴다.
const earthRadiusM = 6_371_000.0

// metersPerDegreeLat은 위도 1도의 거리(미터)다. 위도와 무관하게 거의 일정하다.
const metersPerDegreeLat = 111_320.0

// DistanceMeters는 두 좌표 사이의 대권 거리를 미터로 돌려준다(하버사인).
//
// 평면으로 근사하지 않는 이유: 우리가 다루는 거리는 1km 안쪽이라 평면 근사로도
// 오차가 작지만, 공식을 단순하게 두면 나중에 더 먼 거리에 쓰였을 때 조용히 틀린다.
// 하버사인은 거리와 무관하게 맞고, 계산 비용도 문제가 되지 않는다.
func DistanceMeters(lat1, lng1, lat2, lng2 float64) float64 {
	p1 := lat1 * math.Pi / 180
	p2 := lat2 * math.Pi / 180
	dp := (lat2 - lat1) * math.Pi / 180
	dl := (lng2 - lng1) * math.Pi / 180

	a := math.Sin(dp/2)*math.Sin(dp/2) +
		math.Cos(p1)*math.Cos(p2)*math.Sin(dl/2)*math.Sin(dl/2)
	return 2 * earthRadiusM * math.Asin(math.Sqrt(a))
}

// Offset은 기준 좌표에서 북쪽 northM, 동쪽 eastM 떨어진 좌표를 돌려준다.
// 음수를 넣으면 남쪽·서쪽이다.
//
// 경도 계산에 위도를 반영하는 이유: 경도 1도의 실제 거리는 적도에서 가장 길고
// 극으로 갈수록 짧아진다. 무시하면 북쪽 지역일수록 동서로 더 멀리 옮겨진다.
func Offset(lat, lng, northM, eastM float64) (float64, float64) {
	metersPerDegreeLng := metersPerDegreeLat * math.Cos(lat*math.Pi/180)
	return lat + northM/metersPerDegreeLat, lng + eastM/metersPerDegreeLng
}
