import type { Place } from "./api";
import { atEnd, browseNext, startBrowse, type Browse } from "./browse";
import type { Rng } from "./pick";

/**
 * 한 번에 넓히는 창의 크기.
 *
 * 여덟이라는 수에 근거는 없다. 강남역 실측(2026-09-06)에서 이 크기면 `분식`이
 * 326m 대신 74m를, `중식`이 439m 대신 295m를 권하게 되는 것을 확인했을 뿐이다.
 */
export const WINDOW_STEP = 8;

/**
 * 가까운 순으로 앞 max(windowSize, count)곳만 남긴다. 뽑을 후보의 범위다.
 *
 * **가까운 순 창 안에서만 뽑는 이유가 이 함수의 핵심이다.**
 * 예전에는 종류 안의 모든 가게에서 균등하게 뽑고 나서 보기 좋으라고 정렬했다.
 * 그 정렬은 뽑힐 확률에 아무 영향이 없어서, 조회 지점을 다섯으로 늘리자
 * 먼 가게가 그만큼 자주 나오게 됐다 — 강남역 실측에서 `분식`은 5m 거리에
 * 가게가 있는데도 326m를 권하게 되는 상태였다.
 *
 * windowSize를 넘기면 그만큼 넓힌다. `다른 가게 보기`로 새 묶음을 뽑을 때마다
 * WINDOW_STEP씩 키운다. 창이 목록보다 크면 전체와 같다.
 *
 * 돌려주는 가게는 pool의 객체 그대로다(복사 아님). browse가 항목을 참조로 견주므로,
 * pool은 부를 때마다 다시 걸러 만들지 말고 처음 만든 배열을 계속 써야 한다 —
 * 새로 filter해서 넘기면 같은 가게라도 다른 객체가 되어 이미 본 것을 알아보지 못한다.
 * 식별자로 견주지 않는 것은 조회기가 식별자가 빈 가게를 일부러 살려 두기 때문이다
 * (api/internal/kakao/client.go). 그런 가게끼리는 서로 같다고 잘못 판정된다.
 *
 * 정렬에 toSorted가 아니라 sort를 쓰는 이유: Next.js가 "지원한다"고 선언한 하한이
 * Firefox 111인데(node_modules/next/dist/shared/lib/modern-browserslist-target.js)
 * Array.prototype.toSorted는 Firefox 115부터 있고, Next는 이 메서드를 폴리필하지 않는다.
 * 그 사이 판에서는 종류를 고르는 순간 TypeError가 나서 앱 전체가 오류 화면으로 넘어간다.
 * 아래에서 slice로 새 배열을 만든 뒤 정렬하므로 원본은 건드리지 않는다 —
 * 그 계약은 시험("원본 목록의 순서를 건드리지 않는다")이 지킨다.
 */
export function nearestWindow(
  pool: readonly Place[],
  windowSize: number,
  count: number,
): Place[] {
  return byDistance(pool.slice()).slice(0, Math.max(windowSize, count));
}

/**
 * 뽑은 묶음을 거리순으로 세운다. 화면이 가게마다 거리(m)를 함께 보여주는데
 * 섞인 순서를 그대로 두면 120m 다음에 480m가 오고 그다음에 200m가 오는 식이라 읽기 나쁘다.
 * 받은 배열을 건드리지 않고 새 배열을 돌려준다(toSorted를 못 쓰는 이유는 nearestWindow 참고).
 */
export function byDistance(places: Place[]): Place[] {
  return places.slice().sort((left, right) => left.distance - right.distance);
}

/** 가게 묶음 기록과, 지금까지 넓힌 가까운 순 창의 크기. */
export type PlaceBrowse = { browse: Browse<Place>; windowSize: number };

/**
 * 첫 묶음을 뽑는다. 창은 WINDOW_STEP에서 시작한다.
 * 무작위로 고르는 이유: 걸러진 것을 전부 보여주면 같은 자리에서 같은 종류를 고른
 * 사람에게 언제나 똑같은 화면이 나온다. 그러면 "다른 가게 보기"를 둘 자리가 없다.
 */
export function startPlaces(pool: readonly Place[], count: number, rng: Rng): PlaceBrowse {
  return {
    browse: startBrowse(nearestWindow(pool, WINDOW_STEP, count), count, rng, byDistance),
    windowSize: WINDOW_STEP,
  };
}

/**
 * 다음 묶음으로 간다. 새 묶음을 뽑을 때(기록의 끝)만 창을 WINDOW_STEP 넓히고,
 * 이미 본 묶음으로 가는 중이면 창을 그대로 둔다.
 */
export function nextPlaces(
  state: PlaceBrowse,
  pool: readonly Place[],
  count: number,
  rng: Rng,
): PlaceBrowse {
  const windowSize = atEnd(state.browse) ? state.windowSize + WINDOW_STEP : state.windowSize;
  return {
    browse: browseNext(state.browse, nearestWindow(pool, windowSize, count), count, rng, byDistance),
    windowSize,
  };
}
