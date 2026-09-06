import type { Cuisine } from "./api";

/**
 * 같은 id를 가진 종류가 겹치면 하나만 남긴다.
 *
 * 서버는 종류를 id별로 묶어 한 번씩만 보내 주지만, 그 성질은 JSON을 건너오면서
 * 타입에서 사라진다. 여기서 한 번 좁혀 두면 이후 추첨과 React key가 모두 유일성 위에서 돈다.
 * 보이는 이름이 아니라 id로 견주는 이유: 저장·대조의 기준이 id이고,
 * 화면 문구는 나중에 둘이 같아지도록 다듬어질 수 있다.
 * 같은 id가 둘 이상이면 나중 것이 남는다 — Map.set이 같은 키를 덮어쓰기 때문이다.
 *
 * 원소를 복사하지 않고 받은 객체를 그대로 돌려주는 것이 반드시 지켜야 할 계약이다.
 * web/lib/pick.ts의 pickAvoiding은 직전 후보(avoid)를 `new Set(avoid)`에 담고
 * `.has(item)`으로 겹침을 판정하는데, 이 비교는 값이 아니라 참조로 이뤄진다.
 * 이 함수가 `{...cuisine}`처럼 사본을 돌려주기 시작하면, "다시 뽑기"가 넘기는
 * 직전 후보와 다음 호출이 새로 만드는 종류 목록이 값은 같아도 서로 다른 객체가 되어
 * avoid의 Set에 아무것도 걸리지 않는다. 그러면 "다시 뽑기"를 눌러도 매번 같은
 * 후보만 나오는데, 오류도 경고도 없어 사용자도 개발자도 원인을 알아채기 어렵다.
 */
export function distinctById(cuisines: readonly Cuisine[]): Cuisine[] {
  return [...new Map(cuisines.map((cuisine) => [cuisine.id, cuisine])).values()];
}
