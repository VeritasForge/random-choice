/** 처음 찾아보는 반경(m). */
export const DEFAULT_RADIUS = 500;

/** 결과가 없을 때 제안할 수 있는 반경 목록(m). 오름차순으로 둔다. */
export const WIDER_RADII = [1000, 2000];

/**
 * 방금 실패한 반경보다 넓은 것만 남긴다.
 *
 * 고정 목록을 그대로 보여 주면 막다른 길이 생긴다: 2km에서 결과가 없었는데
 * 다시 "1km로 넓히기"를 제안하면 그건 넓히기가 아니라 좁히기라 결과가 있을 수 없고,
 * "2km로 넓히기"는 방금 실패한 것과 똑같은 조회다. 두 버튼 모두 반드시 실패하는데
 * 화면은 넓어지는 것처럼 안내하게 된다.
 *
 * 남는 것이 없으면 빈 배열을 돌려준다. 그때는 넓히기 버튼 대신
 * 끝났다는 안내를 보여 주어야 한다.
 */
export function widerThan(radius: number): number[] {
  return WIDER_RADII.filter((candidate) => candidate > radius);
}
