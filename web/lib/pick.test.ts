import { describe, expect, it } from "vitest";
import { pickAvoiding, pickDistinct, pickOne, type Rng } from "./pick";

/** 정해진 값을 차례로 돌려주는 가짜 난수 생성기. 값이 떨어지면 처음으로 돌아간다. */
function fixed(...values: number[]): Rng {
  let index = 0;
  return () => values[index++ % values.length];
}

/**
 * 언제나 0을 돌려주는 난수 생성기. 섞기가 일어나지 않아 원래 순서가 그대로 나온다.
 *
 * 주의: zero만 쓰는 시험은 "섞기가 통째로 사라진 구현"과 정상 구현을 구별하지 못한다.
 * rng를 무시하고 앞에서부터 잘라 주는 구현도 zero 기준 결과와 똑같기 때문이다.
 * 그래서 아래 "섞은 순서를 그대로 고정한다" 시험들이 따로 있다.
 */
const zero: Rng = () => 0;

describe("pickDistinct", () => {
  it("요청한 개수만큼 고른다", () => {
    expect(pickDistinct(["a", "b", "c", "d", "e"], 4, zero)).toEqual(["a", "b", "c", "d"]);
  });

  it("목록이 요청한 개수보다 적으면 있는 만큼만 고른다", () => {
    expect(pickDistinct(["a", "b"], 4, zero)).toEqual(["a", "b"]);
  });

  it("같은 항목을 두 번 고르지 않는다", () => {
    const got = pickDistinct(["a", "b", "c", "d", "e"], 4, fixed(0.99));
    expect(new Set(got).size).toBe(4);
  });

  it("원본 목록을 바꾸지 않는다", () => {
    const items = ["a", "b", "c"];
    pickDistinct(items, 2, fixed(0.9));
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("빈 목록이면 빈 결과", () => {
    expect(pickDistinct([], 4, zero)).toEqual([]);
  });

  it("0개를 요청하면 빈 결과", () => {
    expect(pickDistinct(["a", "b"], 0, zero)).toEqual([]);
  });

  // 아래 두 시험이 "무작위로 섞는다"는 약속을 실제로 붙잡는다.
  // 난수를 무시하고 앞에서부터 잘라 주는 구현으로 바꾸면 여기서 실패한다.
  // 이 시험이 없으면 섞기가 죽어도 사용자에게는 늘 같은 순서가 나오고,
  // 화면에도 서버에도 오류가 남지 않아 아무도 알아채지 못한다.
  it("섞은 순서를 그대로 고정한다 — 한 번 자리를 바꾸는 경우", () => {
    // 0.9 -> 0번 자리가 3번 자리("d")와 바뀐다. 이어지는 0은 제자리 교환이다.
    expect(pickDistinct(["a", "b", "c", "d"], 2, fixed(0.9, 0))).toEqual(["d", "b"]);
  });

  it("섞은 순서를 그대로 고정한다 — 세 번 연속 자리를 바꾸는 경우", () => {
    expect(pickDistinct(["a", "b", "c", "d", "e"], 3, fixed(0.5))).toEqual([
      "c",
      "d",
      "b",
    ]);
  });
});

describe("pickAvoiding", () => {
  it("직전 후보를 뺀 나머지로 채울 수 있으면 겹치지 않게 고른다", () => {
    const got = pickAvoiding(["a", "b", "c", "d", "e", "f"], 4, ["a", "b"], zero);
    expect(got).toEqual(["c", "d", "e", "f"]);
  });

  it("남은 것이 모자라면 직전 후보를 다시 써서라도 개수를 채운다", () => {
    const got = pickAvoiding(["a", "b", "c"], 3, ["a", "b", "c"], zero);
    expect(got).toHaveLength(3);
    expect(new Set(got).size).toBe(3);
  });

  it("겹침을 허용해도 같은 항목을 두 번 넣지 않는다", () => {
    const got = pickAvoiding(["a", "b", "c", "d"], 3, ["a", "b", "c"], zero);
    expect(new Set(got).size).toBe(3);
  });

  it("겹치지 않는 것을 먼저 쓰고, 모자란 만큼만 직전 후보에서 가져온다", () => {
    // 이 시험이 보충 대상을 고정한다. 보충을 "직전 후보"가 아니라 "전체 목록"에서
    // 가져오도록 바꾸면 "a"가 두 번 뽑혀 결과가 달라진다.
    expect(pickAvoiding(["a", "b", "c", "d"], 3, ["c", "d"], zero)).toEqual(["a", "b", "c"]);
  });

  it("남은 것 중에서도 무작위로 고른다", () => {
    // 직전 후보 "a"를 뺀 ["b","c","d","e","f"]에서 섞어 고른 순서를 고정한다.
    expect(pickAvoiding(["a", "b", "c", "d", "e", "f"], 2, ["a"], fixed(0.9, 0))).toEqual([
      "f",
      "c",
    ]);
  });
});

describe("pickOne", () => {
  it("난수에 해당하는 항목을 고른다", () => {
    expect(pickOne(["a", "b", "c"], fixed(0.5))).toBe("b");
  });

  it("빈 목록이면 아무것도 고르지 못한다", () => {
    expect(pickOne([], zero)).toBeUndefined();
  });

  it("난수의 양 끝에서도 올바른 항목을 고른다", () => {
    expect(pickOne(["a", "b", "c"], () => 0)).toBe("a");
    // Math.random이 돌려줄 수 있는 1 미만의 가장 큰 값
    expect(pickOne(["a", "b", "c"], () => 0.9999999999999999)).toBe("c");
  });
});
