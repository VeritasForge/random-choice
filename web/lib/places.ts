import type { Place } from "./api";
import { pickAvoiding, type Rng } from "./pick";

/**
 * 종류가 정해진 가게 목록에서 보여줄 만큼만 무작위로 고르고, 가까운 순으로 되돌린다.
 *
 * 무작위로 고르는 이유: 걸러진 것을 전부 보여주면 같은 자리에서 같은 종류를 고른
 * 사람에게 언제나 똑같은 화면이 나온다. 그러면 "다른 가게 보기"를 둘 자리가 없다.
 *
 * 뽑은 뒤 다시 거리순으로 세우는 이유: 화면이 가게마다 거리(m)를 함께 보여준다.
 * 섞인 순서를 그대로 두면 120m 다음에 480m가 오고 그다음에 200m가 오는 식이라 읽기 나쁘다.
 *
 * avoid에는 직전에 보여준 가게를 그대로 넘긴다. pickAvoiding이 항목을 참조로 견주므로,
 * pool은 부를 때마다 다시 걸러 만들지 말고 처음 만든 배열을 계속 써야 한다 —
 * 새로 filter해서 넘기면 같은 가게라도 다른 객체가 되어 겹침 판정이 통째로 무력해진다.
 * 식별자로 견주지 않는 것은 조회기가 식별자가 빈 가게를 일부러 살려 두기 때문이다
 * (api/internal/kakao/client.go). 그런 가게끼리는 서로 같다고 잘못 판정된다.
 *
 * 정렬에 toSorted가 아니라 sort를 쓰는 이유: Next.js가 "지원한다"고 선언한 하한이
 * Firefox 111인데(node_modules/next/dist/shared/lib/modern-browserslist-target.js)
 * Array.prototype.toSorted는 Firefox 115부터 있고, Next는 이 메서드를 폴리필하지 않는다
 * (polyfills 폴더에 fetch·object.assign·process뿐이다). 그 사이 판에서는 종류를 고르는
 * 순간 TypeError가 나서 정렬만이 아니라 앱 전체가 오류 화면으로 넘어간다.
 * 제자리 정렬을 해도 안전한 것은 pickAvoiding이 이미 새 배열을 돌려주기 때문이고,
 * 그 계약은 아래 시험("원본 목록의 순서를 건드리지 않는다")이 지킨다.
 */
export function pickPlaces(
  pool: readonly Place[],
  count: number,
  avoid: readonly Place[],
  rng: Rng,
): Place[] {
  return pickAvoiding(pool, count, avoid, rng).sort(
    (left, right) => left.distance - right.distance,
  );
}
