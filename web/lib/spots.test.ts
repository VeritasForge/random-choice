import { describe, expect, it } from "vitest";
import { appendSpots, type Spot } from "./spots";

const spot = (id: string, name = `장소${id}`): Spot => ({
  id, name, address: "주소", category: "", lat: 35.8, lng: 129.2,
});

describe("검색 결과 이어 붙이기", () => {
  it("빈 목록에 이어 붙인다", () => {
    expect(appendSpots([], [spot("a"), spot("b")]).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("뒤에 붙인다. 순서를 바꾸지 않는다", () => {
    const got = appendSpots([spot("a")], [spot("b"), spot("c")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * **이 시험이 이 파일의 존재 이유다.**
   *
   * 카카오는 마지막 페이지를 넘겨 요청받으면 오류를 주지 않고 마지막 페이지를
   * 그대로 다시 준다(2026-09-20 실측). 중복을 거르지 않으면 `더 보기`를 누를 때마다
   * 같은 장소 열다섯 곳이 목록에 계속 쌓인다.
   */
  it("이미 있는 장소는 다시 붙이지 않는다", () => {
    const first = [spot("a"), spot("b")];
    const got = appendSpots(first, [spot("a"), spot("b")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("겹치는 것만 빼고 새것은 붙인다", () => {
    const got = appendSpots([spot("a"), spot("b")], [spot("b"), spot("c")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  /**
   * 카카오는 식별자가 빈 장소도 준다. 빈 문자열을 열쇠로 쓰면 그런 장소가
   * 하나만 남고 나머지가 모두 사라진다. 음식점 조회도 같은 규칙을 쓴다
   * (api/internal/kakao/client.go의 SearchRestaurants).
   */
  it("식별자가 빈 장소는 중복 판정에서 빼고 그대로 살린다", () => {
    const nameless1 = { ...spot(""), name: "이름없음1" };
    const nameless2 = { ...spot(""), name: "이름없음2" };
    const got = appendSpots([nameless1], [nameless2]);
    expect(got).toHaveLength(2);
    expect(got.map((s) => s.name)).toEqual(["이름없음1", "이름없음2"]);
  });

  it("받은 목록을 바꾸지 않는다", () => {
    const first = [spot("a")];
    appendSpots(first, [spot("b")]);
    expect(first.map((s) => s.id)).toEqual(["a"]);
  });

  it("들어온 목록 안에 중복이 있어도 하나만 남는다", () => {
    const got = appendSpots([], [spot("a"), spot("a"), spot("b")]);
    expect(got.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
