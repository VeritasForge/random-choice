import { pickAvoiding, pickDistinct, type Rng } from "./pick";

/**
 * 넘겨 본 묶음의 기록. 설계: docs/superpowers/specs/2026-11-25-browse-history-design.md 5.1~5.2.
 *
 * 참조 비교 계약: 항목은 id가 아니라 객체 참조로 비교한다(Set 소속 검사).
 * 그래서 items에 넘기는 목록은 호출마다 같은 객체들을 담고 있어야 한다.
 * 복사본이나 새로 만든 객체를 넘기면 이미 본 것을 알아보지 못한다.
 *
 * 모든 함수는 기록을 바꾸지 않고 새 기록을 돌려준다.
 */
export type Browse<T> = {
  /** 본 묶음들, 본 순서 */
  readonly pages: readonly (readonly T[])[];
  /** 지금 보는 묶음의 위치 */
  readonly index: number;
  /** 이번 바퀴에서 본 항목(참조 비교) */
  readonly seen: ReadonlySet<T>;
};

type Order<T> = (page: T[]) => T[];

/** 첫 묶음을 뽑아 기록을 시작한다. order는 뽑은 묶음에 한 번만 적용한다. */
export function startBrowse<T>(
  items: readonly T[],
  count: number,
  rng: Rng,
  order?: Order<T>,
): Browse<T> {
  const picked = pickDistinct(items, count, rng);
  const page = order ? order(picked) : picked;
  return { pages: [page], index: 0, seen: new Set(picked) };
}

/**
 * 다음 묶음으로 간다. 기록 중간이면 이미 본 다음 묶음으로 가고 rng를 쓰지 않는다.
 * 끝에서는 이번 바퀴에서 안 본 것만으로 새 묶음을 뽑는다.
 * 안 본 것이 모자라면 남은 것을 모두 넣고, 빈자리는 지금 묶음과 겹치지 않게 본 것에서 채운 뒤
 * 새 바퀴를 그 묶음으로 시작한다. 한 바퀴가 딱 맞게 끝났을 때도 지금 묶음을 피해 새 바퀴를 연다.
 * 항목이 count개 이하이면 넘길 곳이 없어 같은 기록을 돌려준다.
 */
export function browseNext<T>(
  b: Browse<T>,
  items: readonly T[],
  count: number,
  rng: Rng,
  order?: Order<T>,
): Browse<T> {
  if (!atEnd(b)) {
    return { ...b, index: b.index + 1 };
  }
  if (items.length <= count) {
    return b;
  }

  const current = currentPage(b);
  const unseen = items.filter((item) => !b.seen.has(item));
  let page: T[];
  let seen: ReadonlySet<T>;

  if (unseen.length >= count) {
    page = pickDistinct(unseen, count, rng);
    seen = new Set([...b.seen, ...page]);
  } else if (unseen.length > 0) {
    const reusable = items.filter((item) => b.seen.has(item));
    page = [
      ...pickDistinct(unseen, unseen.length, rng),
      ...pickAvoiding(reusable, count - unseen.length, current, rng),
    ];
    seen = new Set(page);
  } else {
    page = pickAvoiding(items, count, current, rng);
    seen = new Set(page);
  }

  return {
    pages: [...b.pages, order ? order(page) : page],
    index: b.pages.length,
    seen,
  };
}

/** 한 묶음 앞으로 돌아간다. 첫 묶음이면 같은 기록을 그대로 돌려준다. */
export function browsePrev<T>(b: Browse<T>): Browse<T> {
  return canGoBack(b) ? { ...b, index: b.index - 1 } : b;
}

export function currentPage<T>(b: Browse<T>): readonly T[] {
  return b.pages[b.index];
}

export function canGoBack<T>(b: Browse<T>): boolean {
  return b.index > 0;
}

export function atEnd<T>(b: Browse<T>): boolean {
  return b.index === b.pages.length - 1;
}

/** 기록에 더 본 묶음이 있거나, 새로 뽑을 만큼 항목이 있으면 앞으로 갈 수 있다. */
export function canGoForward<T>(b: Browse<T>, items: readonly T[], count: number): boolean {
  return !atEnd(b) || items.length > count;
}
