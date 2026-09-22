/**
 * 장소 검색 결과를 다루는 순수 함수.
 *
 * 이 판단을 화면 조각이 아니라 여기 두는 이유: 화면 시험은 브라우저 없이 node에서
 * 돌아 .tsx 파일에 닿지 못한다(web/vitest.config.mts). 컴포넌트 안에 두면
 * 아무 시험도 이것을 지키지 못한다.
 */

import type { Anchor } from "./anchor";

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

/**
 * `더 보기`를 누를 때 카카오에 보낼 검색어를 정한다.
 *
 * 1쪽(새로 찾기)은 지금 입력창의 글자(keyword)를 쓰고, 2쪽 이상(더 보기)은
 * 방금 찾았던 글자(searched)를 쓴다. **언제나 keyword를 쓰면 안 된다** —
 * 사용자가 목록을 보면서 입력창을 다른 글자로 고친 뒤(아직 `찾기`를 누르지
 * 않은 채) `더 보기`를 누르면, 새 글자의 다음 쪽이 기존 목록 뒤에 이어 붙어
 * 서로 다른 두 검색어의 결과가 한 목록에 섞이고, 그 뒤로 골라 저장되는 글자도
 * 화면에 보이던 검색어가 아니라 입력창의 새 글자가 된다.
 */
export function queryForPage(page: number, keyword: string, searched: string): string {
  return page === 1 ? keyword.trim() : searched;
}

/**
 * `OOO로 다시 찾기`가 이름으로 다시 조회한 결과에서 기준점을 고른다.
 *
 * 카카오가 매긴 순위 그대로 1등을 쓴다. 좌표를 저장해 두지 않으므로(web/lib/anchor.ts)
 * 이름으로 다시 물어야 하는데, 같은 이름의 가게가 여럿이거나 그때와 카카오의 순위가
 * 바뀌면 이전과 다른 곳이 나올 수 있다 — 검색 화면 없이 곧장 결과로 넘어가기로 한
 * 대신 감수하기로 한 위험이다.
 *
 * 결과가 없으면 null이다. 이름이 바뀌었거나 가게가 없어진 경우이고, 부르는 쪽은
 * 그 이름을 채운 검색 화면을 열어 손으로 다시 찾게 해야 한다(web/app/page.tsx의
 * resumeAnchor).
 */
export function resolveAnchor(spots: readonly Spot[]): Extract<Anchor, { kind: "spot" }> | null {
  const top = spots[0];
  return top === undefined ? null : { kind: "spot", name: top.name, lat: top.lat, lng: top.lng };
}
