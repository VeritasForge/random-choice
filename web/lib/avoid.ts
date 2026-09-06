import type { Place } from "./api";
import type { Visit } from "./visits";

export type AvoidResult = {
  /** 회피를 적용한 뒤 남은 가게. */
  places: Place[];
  /**
   * 실제로 뺀 가게 수. 0이면 화면은 안내 줄을 그리지 않는다.
   * 단 released가 true인 회차의 0은 "뺄 것이 없었다"는 사실이 아니라 관례이므로, 화면은 released를 먼저 봐야 한다.
   */
  removed: number;
  /** 전부 빠져서 이번만 회피를 풀었으면 true. */
  released: boolean;
};

/**
 * 사용자가 최근에 "여기로 정했어요"를 누른 가게를 결과에서 뺀다.
 *
 * **몇 곳을 뺐는지 함께 돌려주는 이유**: 조용히 거르면 통제권이 없는 것과 같다.
 * 무엇을 했는지 말해 주고 되돌릴 수 있게 하는 것이 이 설계의 뼈대다.
 *
 * **전부 빠지면 이번만 푸는 이유**: 회피 때문에 빈 화면을 주면, 사용자는 주변에
 * 가게가 없다고 오해한다. 있는데 우리가 감춘 것이므로 보여 주고 그 사실을 알린다.
 *
 * 기간은 여기서 보지 않는다. 보관 기간을 넘긴 기록은 readVisits가 이미 걸러
 * 주므로, 여기서 날짜를 한 번 더 보면 같은 규칙이 두 곳에 생겨 나중에 한쪽만
 * 바뀐다.
 */
export function avoidVisited(
  places: readonly Place[],
  visits: readonly Visit[],
  enabled: boolean,
): AvoidResult {
  // 배열을 복사해서 돌려준다. 넣어 준 것을 그대로 돌려주면 화면이 결과를 제자리
  // 정렬하는 순간 호출자의 원본까지 뒤집힌다. 아래 "이번만 푼다" 분기도 같다.
  // 끈 경우와 목록이 빈 경우를 한 줄로 묶어도 정보가 사라지지 않는다 — 호출자는 enabled도 목록 길이도 이미 알고 있어서, 어느 쪽이었는지 되물을 일이 없다.
  if (!enabled || places.length === 0) {
    return { places: [...places], removed: 0, released: false };
  }

  const visited = new Set(visits.map((v) => v.placeId));

  // 장소 ID가 빈 가게는 대조하지 않고 무조건 남긴다. 카카오는 ID가 빈 응답도 주고
  // 조회기는 그런 가게를 일부러 살려 두는데(api/internal/kakao/client.go), 빈
  // 문자열을 열쇠로 삼으면 서로 아무 상관 없는 그 가게들이 한 번에 사라진다.
  //
  // 기록 쪽에서 빈 ID를 미리 걸러 내는 방법도 있지만 **둘 다 두지는 않는다.**
  // 두 방법은 모든 입력에서 결과가 똑같아서, 한쪽을 지워도 시험이 전부 통과한다 —
  // 즉 두 줄을 다 두면 어느 쪽도 지켜지는지 확인할 수 없는 장식이 된다. 게다가
  // 기록 쪽 방어가 막으려는 상황은 visits.ts가 이미 두 겹으로 막고 있다
  // (recordVisit은 빈 ID를 저장하지 않고, readVisits는 빈 ID 항목을 걸러 낸다).
  // 그래서 실제로 존재하는 데이터를 다루는 이 줄만 남긴다.
  const kept = places.filter((p) => p.id === "" || !visited.has(p.id));

  if (kept.length === 0) {
    return { places: [...places], removed: 0, released: true };
  }
  return { places: kept, removed: places.length - kept.length, released: false };
}
