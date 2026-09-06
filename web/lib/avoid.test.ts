import { describe, expect, it } from "vitest";
import { avoidVisited } from "./avoid";
import type { Place } from "./api";
import type { Visit } from "./visits";

// 시험마다 새 객체를 만든다. 하나를 여러 시험이 나눠 쓰면 어느 한 곳이 제자리
// 정렬·삭제를 하는 순간 다음 시험이 오염되고, 그러면 방어를 지웠을 때 실패하는지
// 확인하는 작업 자체를 믿을 수 없게 된다.
function place(id: string): Place {
  return {
    id, name: `가게${id}`, cuisineId: "gogi", distance: 100,
    roadAddress: "길", phone: "", placeUrl: "", lat: 37.4, lng: 127.0,
  };
}
const visit = (placeId: string): Visit => ({ placeId, placeName: `가게${placeId}`, at: "2026-09-05T12:00:00Z" });

describe("정한 곳 회피", () => {
  it("기록에 있는 가게를 뺀다", () => {
    const got = avoidVisited([place("a"), place("b")], [visit("a")], true);
    expect(got.places.map((p) => p.id)).toEqual(["b"]);
    expect(got.removed).toBe(1);
    expect(got.released).toBe(false);
  });

  it("꺼져 있으면 아무것도 빼지 않는다", () => {
    const places = [place("a"), place("b")];
    const got = avoidVisited(places, [visit("a")], false);
    expect(got.places).toHaveLength(2);
    expect(got.removed).toBe(0);
    // 넣어 준 배열을 그대로 돌려주면, 화면이 결과를 제자리 정렬하는 순간
    // 호출자가 들고 있는 원본까지 함께 뒤집힌다. 반드시 새 배열이어야 한다.
    expect(got.places).not.toBe(places);
  });

  it("기록이 비어 있으면 뺀 것이 0이다", () => {
    const got = avoidVisited([place("a")], [], true);
    expect(got.removed).toBe(0);
    expect(got.places).toHaveLength(1);
  });

  // 전부 빠지면 빈 화면이 된다. 이번만 풀되 풀었다는 사실을 화면이 알아야 알릴 수 있다.
  it("전부 빠지면 이번만 풀고 그 사실을 함께 돌려준다", () => {
    const places = [place("a"), place("b")];
    const got = avoidVisited(places, [visit("a"), visit("b")], true);
    expect(got.places).toHaveLength(2);
    expect(got.released).toBe(true);
    expect(got.removed).toBe(0);
    expect(got.places).not.toBe(places);
  });

  it("빈 목록을 넣으면 빈 목록이 나온다", () => {
    const got = avoidVisited([], [visit("a")], true);
    expect(got.places).toEqual([]);
    expect(got.released).toBe(false);
  });

  // 조회기가 식별자 빈 가게를 살려 두므로, 빈 문자열끼리 같다고 판정하면 안 된다.
  //
  // released까지 확인하는 이유: 확인하지 않으면 이 시험은 아무것도 지키지 않는다.
  // 빈 식별자 방어를 지우면 두 가게가 모두 빠지는데, 그러면 "전부 빠졌으니 이번만
  // 푼다" 규칙이 대신 두 곳을 돌려주고 뺀 수도 0으로 맞춰 버린다. 이름이 가리키는
  // 방어가 죽어도 다른 규칙이 답을 맞혀 주는 셈이라, 방어가 살아 있을 때만 참인
  // released=false를 함께 걸어 둔다.
  it("장소 ID가 빈 가게는 서로를 지우지 않는다", () => {
    const nameless = [place(""), place("")];
    const got = avoidVisited(nameless, [{ placeId: "", placeName: "", at: "2026-09-05T12:00:00Z" }], true);
    expect(got.places).toHaveLength(2);
    expect(got.removed).toBe(0);
    expect(got.released).toBe(false);
  });

  // 위 시험은 "전부 빠지면 푼다" 규칙과 얽혀 있으니, 얽히지 않는 모양으로 한 번 더 본다.
  // 식별자 있는 가게 하나가 실제로 빠지는 상황에서도 식별자 빈 가게는 남아야 한다.
  it("식별자 빈 가게는 남기고 기록에 있는 가게만 뺀다", () => {
    const got = avoidVisited(
      [place(""), place("a")],
      [{ placeId: "", placeName: "", at: "2026-09-05T12:00:00Z" }, visit("a")],
      true,
    );
    expect(got.places.map((p) => p.id)).toEqual([""]);
    expect(got.removed).toBe(1);
    expect(got.released).toBe(false);
  });

  it("원본 목록을 건드리지 않는다", () => {
    const places = [place("a"), place("b")];
    const copy = [...places];
    avoidVisited(places, [visit("a")], true);
    expect(places).toEqual(copy);
  });
});
