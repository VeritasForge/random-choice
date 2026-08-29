import { describe, expect, it } from "vitest";
import { pickAvoiding, pickDistinct, pickOne, type Rng } from "./pick";

/** 정해진 값을 차례로 돌려주는 가짜 난수 생성기. 값이 떨어지면 처음으로 돌아간다. */
function fixed(...values: number[]): Rng {
  let index = 0;
  return () => values[index++ % values.length];
}

/** 언제나 0을 돌려주는 난수 생성기. 섞기가 일어나지 않아 원래 순서가 그대로 나온다. */
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
});

describe("pickOne", () => {
  it("난수에 해당하는 항목을 고른다", () => {
    expect(pickOne(["a", "b", "c"], fixed(0.5))).toBe("b");
  });

  it("빈 목록이면 아무것도 고르지 못한다", () => {
    expect(pickOne([], zero)).toBeUndefined();
  });
});
