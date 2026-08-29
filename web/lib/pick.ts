/** 0 이상 1 미만의 수를 돌려주는 함수. 시험에서는 정해진 값을 주는 가짜를 넣는다. */
export type Rng = () => number;

/**
 * 목록에서 중복 없이 최대 count개를 무작위로 고른다.
 * 목록이 count개보다 적으면 있는 만큼만 돌려준다.
 * 원본 목록은 건드리지 않는다.
 *
 * 항목마다 뽑힐 확률이 같다. 가게 수가 많은 종류를 더 잘 뽑히게 하면
 * 흔한 한식만 계속 나와서 이 서비스의 쓸모가 사라진다.
 */
export function pickDistinct<T>(items: readonly T[], count: number, rng: Rng): T[] {
  const pool = [...items];
  const take = Math.min(count, pool.length);
  const picked: T[] = [];

  // 앞에서부터 필요한 개수만큼만 자리를 확정하는 방식(부분 피셔-예이츠 섞기).
  for (let i = 0; i < take; i += 1) {
    const target = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[target]] = [pool[target], pool[i]];
    picked.push(pool[i]);
  }
  return picked;
}

/**
 * 직전 후보(avoid)와 최대한 겹치지 않게 count개를 고른다.
 * 겹치지 않는 것만으로 개수를 채울 수 없으면 직전 후보에서 마저 채운다.
 * "다시 뽑기"를 눌렀는데 같은 것만 나오면 다시 뽑은 의미가 없기 때문이다.
 */
export function pickAvoiding<T>(
  items: readonly T[],
  count: number,
  avoid: readonly T[],
  rng: Rng,
): T[] {
  const avoided = new Set(avoid);
  const fresh = items.filter((item) => !avoided.has(item));

  if (fresh.length >= count) {
    return pickDistinct(fresh, count, rng);
  }

  const reusable = items.filter((item) => avoided.has(item));
  return [
    ...pickDistinct(fresh, fresh.length, rng),
    ...pickDistinct(reusable, count - fresh.length, rng),
  ];
}

/** 목록에서 하나를 무작위로 고른다. 목록이 비어 있으면 아무것도 돌려주지 않는다. */
export function pickOne<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[Math.floor(rng() * items.length)];
}
