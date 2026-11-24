import { describe, expect, it } from "vitest";
import {
  atEnd,
  browseNext,
  browsePrev,
  canGoBack,
  canGoForward,
  currentPage,
  startBrowse,
  type Browse,
} from "./browse";
import type { Rng } from "./pick";

/** 정해진 값을 차례로 돌려주는 가짜 난수 생성기. 값이 떨어지면 처음으로 돌아간다. */
function fixed(...values: number[]): Rng {
  let index = 0;
  return () => values[index++ % values.length];
}

const letters = (n: number) => "ABCDEFGHIJKLM".slice(0, n).split("");

/** 시작한 뒤 next를 times번 누른 기록을 돌려준다. */
function advance(items: string[], times: number, rng: Rng): Browse<string> {
  let b = startBrowse(items, 4, rng);
  for (let i = 0; i < times; i += 1) {
    b = browseNext(b, items, 4, rng);
  }
  return b;
}

describe("browse", () => {
  it("startBrowse는 첫 묶음을 기록하고 본 것으로 표시한다", () => {
    const items = letters(12);
    const b = startBrowse(items, 4, fixed(0.3, 0.7));
    expect(b.pages.length).toBe(1);
    expect(b.index).toBe(0);
    expect(b.seen.size).toBe(4);
    expect(canGoBack(b)).toBe(false);
  });

  it("한 바퀴 안에서는 같은 항목이 두 번 나오지 않는다", () => {
    const items = letters(12);
    const b = advance(items, 2, fixed(0.1, 0.9, 0.5));
    expect(b.pages.length).toBe(3);
    expect(new Set(b.pages.flat()).size).toBe(12);
  });

  it("바퀴 경계: 남은 것을 모두 넣고 빈자리는 지금 묶음과 겹치지 않게 채운다", () => {
    const items = letters(13);
    for (const rng of [fixed(0), fixed(0.99), fixed(0.2, 0.8), fixed(0.5, 0.1, 0.9)]) {
      const three = advance(items, 2, rng);
      const unseen = items.filter((x) => !three.seen.has(x));
      expect(unseen.length).toBe(1);
      const fourth = browseNext(three, items, 4, rng);
      const page = currentPage(fourth);
      expect(page.length).toBe(4);
      expect(page).toContain(unseen[0]);
      const rest = page.filter((x) => x !== unseen[0]);
      const third = currentPage(three);
      expect(rest.some((x) => third.includes(x))).toBe(false);
    }
  });

  it("두 번째 바퀴는 바퀴를 넘긴 묶음의 항목을 본 것으로 시작한다", () => {
    const items = letters(13);
    const rng = fixed(0.2, 0.8, 0.4);
    const fourth = browseNext(advance(items, 2, rng), items, 4, rng);
    expect(fourth.seen).toEqual(new Set(currentPage(fourth)));
    const fifth = browseNext(fourth, items, 4, rng);
    expect(currentPage(fifth).some((x) => currentPage(fourth).includes(x))).toBe(false);
  });

  it("바퀴가 딱 맞게 끝나면 지금 묶음과 겹치지 않게 새 바퀴를 시작한다", () => {
    const items = letters(8);
    const rng = fixed(0.3, 0.6, 0.9);
    const two = advance(items, 1, rng);
    const three = browseNext(two, items, 4, rng);
    expect(currentPage(three).some((x) => currentPage(two).includes(x))).toBe(false);
    expect(three.seen).toEqual(new Set(currentPage(three)));
  });

  it("이전은 한 칸씩 돌아가고 첫 묶음에서는 그대로다", () => {
    const b = advance(letters(12), 2, fixed(0.1, 0.9));
    const first = browsePrev(browsePrev(b));
    expect(first.index).toBe(0);
    expect(browsePrev(first)).toBe(first);
  });

  it("이전 뒤 다음은 같은 묶음을 다시 지나가고 끝에서만 새로 뽑는다", () => {
    const items = letters(13);
    const rng = fixed(0.1, 0.9, 0.5);
    const three = advance(items, 2, rng);
    const third = currentPage(three);
    let b = browsePrev(browsePrev(three));
    b = browseNext(browseNext(b, items, 4, rng), items, 4, rng);
    expect(currentPage(b)).toEqual(third);
    expect(b.pages.length).toBe(3);
    const next = browseNext(b, items, 4, rng);
    expect(next.pages.length).toBe(4);
    const seenBefore = new Set(three.pages.flat());
    // 13개 중 앞 세 묶음 12개를 피해 남은 1개가 들어 있다.
    const fresh = currentPage(next).filter((x) => !seenBefore.has(x));
    expect(fresh.length).toBe(1);
  });

  it("기록 중간에서 다음은 rng를 쓰지 않는다", () => {
    const items = letters(12);
    const three = advance(items, 2, fixed(0.4, 0.6));
    const mid = browsePrev(three);
    let calls = 0;
    const counting: Rng = () => {
      calls += 1;
      return 0.5;
    };
    browseNext(mid, items, 4, counting);
    expect(calls).toBe(0);
  });

  it("order는 새로 뽑은 묶음에 한 번만 적용된다", () => {
    const items = letters(12);
    const reverse = (page: string[]) => page.slice().sort().reverse();
    const rng = fixed(0.2, 0.7);
    const first = startBrowse(items, 4, rng, reverse);
    expect(currentPage(first)).toEqual(currentPage(first).slice().sort().reverse());
    const second = browseNext(first, items, 4, rng, reverse);
    expect(currentPage(second)).toEqual(currentPage(second).slice().sort().reverse());
    // 앞 묶음은 다시 정렬되지 않고 그대로다.
    expect(second.pages[0]).toBe(first.pages[0]);
  });

  it("항목이 count 이하이면 다음으로 갈 수 없다", () => {
    const items = letters(3);
    const b = startBrowse(items, 4, fixed(0.5));
    expect(canGoForward(b, items, 4)).toBe(false);
    expect(browseNext(b, items, 4, fixed(0.5))).toBe(b);
  });

  it("빈 목록이면 빈 묶음 하나로 시작한다", () => {
    const b = startBrowse<string>([], 4, fixed(0.5));
    expect(currentPage(b)).toEqual([]);
    expect(canGoBack(b)).toBe(false);
    expect(canGoForward(b, [], 4)).toBe(false);
    expect(atEnd(b)).toBe(true);
  });

  it("원본 목록을 바꾸지 않는다", () => {
    const items = letters(13);
    const copy = [...items];
    advance(items, 4, fixed(0.9, 0.1));
    expect(items).toEqual(copy);
  });
});
