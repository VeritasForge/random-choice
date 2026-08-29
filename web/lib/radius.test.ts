import { describe, expect, it } from "vitest";
import { DEFAULT_RADIUS, WIDER_RADII, widerThan } from "./radius";

describe("widerThan", () => {
  it("처음 반경에서는 준비된 것을 모두 제안한다", () => {
    expect(widerThan(DEFAULT_RADIUS)).toEqual(WIDER_RADII);
  });

  it("이미 시도한 반경과 같거나 좁은 것은 제안하지 않는다", () => {
    // 1km에서 결과가 없었다면 1km를 다시 제안하는 것은 같은 조회를 반복하는 것이다.
    expect(widerThan(1000)).toEqual([2000]);
  });

  it("가장 넓은 반경에서 실패하면 제안할 것이 없다", () => {
    // 여기서 빈 배열이 나와야 화면이 넓히기 버튼 대신 종료 안내를 보여 준다.
    // 빈 배열이 아니면 반드시 실패할 버튼을 "넓히기"라고 보여 주는 막다른 길이 된다.
    expect(widerThan(2000)).toEqual([]);
  });

  it("준비된 것보다 넓은 반경에서도 제안할 것이 없다", () => {
    expect(widerThan(5000)).toEqual([]);
  });

  it("제안 목록은 오름차순이다", () => {
    const got = widerThan(DEFAULT_RADIUS);
    expect(got).toEqual([...got].sort((a, b) => a - b));
  });
});
