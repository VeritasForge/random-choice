/**
 * 화면에 붙일 짧은 이유 문구를 만든다.
 *
 * 이유를 붙이는 근거: 추천 이유를 설명하면 수용도가 오른다는 것이 여러 연구가
 * 같은 방향으로 가리키는 결과다. 다만 그것은 **정보가 담긴 이유**에 관한 것이고,
 * 늘 참인 딱지에는 적용되지 않는다. 그래서 뺀 것이 없으면 안내를 만들지 않는다.
 */

/**
 * 도보 1분에 걷는 거리(m).
 *
 * 시속 4km를 분으로 나눈 값이다. 한국 부동산 광고는 보통 이보다 빠른 기준
 * (분당 80~100m)을 쓰지만, 그 법정 기준을 확인하지 못했고 광고 기준은 짧게
 * 보이도록 만들어졌을 수 있다. **넉넉히 잡는 쪽을 골랐다** — "5분"이라고 하고
 * 4분이 걸리는 편이 그 반대보다 낫다.
 */
const WALK_METERS_PER_MINUTE = 67;

/** "240m · 도보 4분" 같은 문구. 도보 시간은 올림하고 최소 1분이다. */
export function distanceLabel(meters: number): string {
  const minutes = Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));
  return `${meters}m · 도보 ${minutes}분`;
}

/**
 * 후보 카드에 붙일 문구.
 *
 * 한 곳뿐이어도 그대로 말한다. 음식점이 드문 곳에서는 실제로 그런 카드가 생기고
 * (제주 애월 실측에서 카드 6장 중 3장), 감추면 "다른 가게 보기"를 눌렀을 때
 * 아무 일도 일어나지 않는 이유를 사용자가 알 수 없다.
 */
export function countLabel(count: number): string {
  return `주변 ${count}곳`;
}

/**
 * 결과 화면 맨 위 안내. 뺀 것이 없으면 null을 돌려주고, 화면은 줄 자체를 그리지 않는다.
 *
 * released는 회피 때문에 가게가 하나도 안 남아 이번만 푼 경우다.
 * 그때 아무 말도 하지 않으면 사용자는 회피가 동작하지 않는다고 여긴다.
 *
 * **released를 반드시 먼저 본다**: avoid.ts는 전부 빠져 이번만 푸는 경우
 * removed를 0으로 돌려준다(실제로 뺀 곳이 없어서가 아니라, 전부 다시 보여
 * 주기로 했다는 관례다). removed만 보고 판단하면 이 경우 "0곳 뺐어요"나
 * 아무 안내도 없는 화면이 되어, "여기 있는 곳은 전부 최근에 고른 곳"이라는
 * 진짜 사정을 감춘다. 그래서 released부터 확인해야 한다 — 순서를 바꾸면
 * (removed 분기를 먼저 두면) 이 사실이 조용히 깨진다.
 */
export function avoidNotice(removed: number, released: boolean): string | null {
  if (released) {
    return "여기 있는 곳은 모두 최근에 정하신 곳이라 이번엔 그대로 보여 드려요";
  }
  if (removed <= 0) {
    return null;
  }
  return `지난번에 정하신 곳 ${removed}곳은 빼고 골랐어요`;
}

/**
 * 뺀 가게를 "다시 넣기"로 되돌릴 수 있는지. 화면은 이 값이 참일 때만 그 버튼을 그린다.
 *
 * **released를 먼저 보는 것이 이 함수가 존재하는 이유다.** 이번만 회피를 푼 회차는
 * 이미 모든 가게를 보여 주고 있어서 되돌릴 것이 없는데, avoid.ts가 그 회차의
 * removed를 0으로 돌려주는 것은 "뺄 것이 없었다"는 사실이 아니라 관례다.
 * 그 관례가 바뀌어 removed에 실제 수가 채워지면, released를 보지 않는 판정은
 * 누를 것이 없는 버튼을 그리기 시작한다 — 눌러도 화면이 그대로라 고장으로 보인다.
 *
 * 이 규칙을 화면 쪽 삼항 연산자로 두지 않고 여기로 가져온 이유: 안내 문구를 고르는
 * 규칙(avoidNotice)과 되돌리기 손잡이를 주는 규칙은 같은 사실을 보고 판단하므로,
 * 떨어져 있으면 한쪽만 고쳐져 서로 어긋난다. 시험이 붙는 자리이기도 하다.
 */
export function canRestore(removed: number, released: boolean): boolean {
  if (released) {
    return false;
  }
  return removed > 0;
}

/**
 * 기록 화면에서 방금 지운 뒤 보여줄 안내. avoidNotice와 같은 모양이다 — 지운 것이
 * 없으면 null을 돌려주고 화면은 줄 자체를 그리지 않는다.
 */
export function forgetNotice(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return `${count}곳을 지웠어요`;
}
