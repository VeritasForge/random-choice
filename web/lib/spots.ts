/**
 * 장소 검색 결과를 다루는 순수 함수.
 *
 * 이 판단을 화면 조각이 아니라 여기 두는 이유: 화면 시험은 브라우저 없이 node에서
 * 돌아 .tsx 파일에 닿지 못한다(web/vitest.config.mts). 컴포넌트 안에 두면
 * 아무 시험도 이것을 지키지 못한다.
 */

/** 음식점을 찾을 기준으로 삼을 장소 한 곳. 서버의 spotDTO와 같은 모양이다. */
export type Spot = {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
};

/**
 * `더 보기`로 받은 결과를 지금 목록 뒤에 이어 붙인다. 이미 있는 장소는 빼고 붙인다.
 *
 * **중복을 거르는 것이 이 함수의 전부이고, 그것이 꼭 필요한 이유가 있다.**
 * 카카오는 마지막 페이지를 넘겨 요청받으면 오류를 주지 않고 마지막 페이지를 그대로
 * 다시 준다(2026-09-20 실측: 15개씩 받을 때 4페이지가 3페이지와 같았다).
 * 화면이 서버가 준 끝 표시(isEnd)를 보고 멈추는 것이 1차 방어이고, 이 함수가 2차다.
 * 둘 다 두는 이유는 끝 표시를 읽는 자리가 화면 조각이라 시험이 닿지 못하기 때문이다.
 *
 * 식별자가 빈 장소는 중복 판정에서 뺀다. 빈 문자열을 열쇠로 쓰면 그런 장소가
 * 하나만 남고 나머지가 사라진다. 음식점 조회도 같은 규칙을 쓴다
 * (api/internal/kakao/client.go의 SearchRestaurants).
 */
export function appendSpots(existing: readonly Spot[], incoming: readonly Spot[]): Spot[] {
  const seen = new Set(existing.map((s) => s.id).filter((id) => id !== ""));
  const merged = [...existing];
  for (const spot of incoming) {
    if (spot.id !== "") {
      if (seen.has(spot.id)) continue;
      seen.add(spot.id);
    }
    merged.push(spot);
  }
  return merged;
}
