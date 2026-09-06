import { describe, expect, it } from "vitest";
import type { Cuisine } from "./api";
import { distinctById } from "./cuisines";

/** 시험에 필요한 것은 id와 label뿐이므로 count는 임의의 값으로 고정한다. */
function cuisine(id: string, label: string): Cuisine {
  return { id, label, count: 1 };
}

describe("distinctById", () => {
  it("사본이 아니라 원본 객체를 그대로 돌려준다", () => {
    const list = [cuisine("bunsik", "분식")];
    const result = distinctById(list);

    // toEqual(값 비교)이 아니라 toBe(참조 비교)를 쓰는 이유가 이 시험의 핵심이다.
    // web/lib/pick.ts의 pickAvoiding은 직전 후보를 `new Set(avoid).has(item)`으로
    // 걸러내는데, 이 비교가 참조로 이뤄진다. distinctById가 `{...cuisine}`처럼
    // 사본을 돌려주도록 "정리"되면 이 시험만 실패하고 값 비교 시험은 계속 통과한다 —
    // 그래서 여기서 값 비교로 완화하면 안 되고, 실패했다면 사본을 만들지 않도록
    // 되돌려야 한다. 그러지 않으면 "다시 뽑기"가 매번 같은 후보만 내놓는데도
    // 화면에도 콘솔에도 아무 흔적이 남지 않는다.
    expect(result[0]).toBe(list[0]);
  });

  it("같은 id가 겹치면 하나만 남긴다", () => {
    const result = distinctById([cuisine("bunsik", "분식"), cuisine("bunsik", "분식 사본")]);
    expect(result).toHaveLength(1);
  });

  it("id가 겹치면 나중 것이 남는다 — Map.set이 같은 키를 덮어쓰기 때문이다", () => {
    const first = cuisine("bunsik", "분식");
    const second = cuisine("bunsik", "분식 사본");
    expect(distinctById([first, second])).toEqual([second]);
  });

  it("서로 다른 id는 입력 순서 그대로 모두 남는다", () => {
    const bunsik = cuisine("bunsik", "분식");
    const hansik = cuisine("hansik", "한식");
    const salad = cuisine("salad", "샐러드");
    expect(distinctById([bunsik, hansik, salad])).toEqual([bunsik, hansik, salad]);
  });

  it("빈 목록이면 빈 목록을 돌려준다", () => {
    expect(distinctById([])).toEqual([]);
  });
});
