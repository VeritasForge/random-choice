import { describe, expect, it } from "vitest";
import type { Place } from "./api";
import type { Rng } from "./pick";
import { pickPlaces } from "./places";

/** 거리만 다른 가짜 가게. 이 시험에 필요한 것은 이름과 거리뿐이다. */
function place(name: string, distance: number): Place {
  return {
    id: name,
    name,
    cuisineId: "salad",
    distance,
    roadAddress: "",
    phone: "",
    placeUrl: "",
    lat: 0,
    lng: 0,
  };
}

/** 정해진 값을 차례로 돌려주는 가짜 난수 생성기. 값이 떨어지면 처음으로 돌아간다. */
function fixed(...values: number[]): Rng {
  let index = 0;
  return () => values[index++ % values.length];
}

/**
 * 언제나 0을 돌려주는 난수 생성기. 섞기가 일어나지 않아 원래 순서가 그대로 나온다.
 *
 * 주의: zero만 쓰는 시험은 "뽑기가 통째로 사라진 구현"과 정상 구현을 구별하지 못한다.
 * 난수를 무시하고 앞에서부터 잘라 주는 구현도 zero 기준 결과와 똑같기 때문이다
 * (lib/pick.test.ts가 같은 함정을 적어 두었다). 그래서 아래 "난수에 따라 다른 가게가
 * 뽑힌다" 시험이 서로 다른 난수로 결과가 갈리는 것을 따로 못 박는다.
 */
const zero: Rng = () => 0;

describe("pickPlaces", () => {
  it("요청한 개수만큼만 고른다", () => {
    const pool = [
      place("가", 100),
      place("나", 200),
      place("다", 300),
      place("라", 400),
      place("마", 500),
      place("바", 600),
    ];
    expect(pickPlaces(pool, 4, [], zero)).toHaveLength(4);
  });

  // 화면이 가게마다 거리(m)를 함께 보여주므로 순서가 뒤죽박죽이면 읽기 어렵다.
  // 일부러 먼 곳부터 담아 두었다 — 정렬이 빠지면 담은 순서 그대로 나와 실패한다.
  it("고른 가게를 가까운 순으로 돌려준다", () => {
    const pool = [place("먼곳", 400), place("중간", 300), place("가까운곳", 100)];
    expect(pickPlaces(pool, 3, [], zero).map((found) => found.name)).toEqual([
      "가까운곳",
      "중간",
      "먼곳",
    ]);
  });

  // "다른 가게 보기"를 눌렀는데 같은 목록이 나오면 누른 의미가 없다.
  it("직전에 보여준 가게를 피해서 고른다", () => {
    const pool = [
      place("가", 100),
      place("나", 200),
      place("다", 300),
      place("라", 400),
    ];
    const shown = [pool[0], pool[1]];
    const next = pickPlaces(pool, 2, shown, zero);
    expect(next.map((found) => found.name)).toEqual(["다", "라"]);
  });

  // 난수를 무시하고 앞에서부터 잘라 주는 구현을 잡는다.
  // 그런 구현은 어떤 난수를 넣어도 언제나 같은 두 곳을 돌려주므로 둘째 단언에서 걸린다.
  it("난수에 따라 다른 가게가 뽑힌다", () => {
    const pool = [
      place("가", 100),
      place("나", 200),
      place("다", 300),
      place("라", 400),
      place("마", 500),
      place("바", 600),
    ];
    expect(pickPlaces(pool, 2, [], zero).map((found) => found.name)).toEqual(["가", "나"]);
    expect(pickPlaces(pool, 2, [], fixed(0.9)).map((found) => found.name)).toEqual([
      "가",
      "바",
    ]);
  });

  // "다른 가게 보기"를 거듭 누르면 결국 안 보여준 가게가 동나고 이 경로로 들어온다.
  // 그때도 개수를 채워야 한다 — 네 곳을 보다가 갑자기 한 곳만 남으면 화면이 무너진다.
  it("안 보여준 가게가 모자라면 직전에 보여준 가게에서 마저 채운다", () => {
    const pool = [
      place("가", 100),
      place("나", 200),
      place("다", 300),
      place("라", 400),
      place("마", 500),
    ];
    const shown = [pool[0], pool[1], pool[2], pool[3]];
    const next = pickPlaces(pool, 4, shown, zero);
    expect(next.map((found) => found.name)).toEqual(["가", "나", "다", "마"]);
  });

  // 이 서비스가 실제로 부딪히는 상황이다. 가장 가까운 45곳 안에서
  // 샐러드로 분류된 가게가 한 곳뿐인 자리가 있었다(2026-09-06 홍대입구역 실측).
  it("가게가 요청 개수보다 적으면 있는 만큼만 돌려준다", () => {
    const pool = [place("샐러디", 121)];
    expect(pickPlaces(pool, 4, [], zero).map((found) => found.name)).toEqual(["샐러디"]);
  });

  // 원본을 건드리면 화면이 들고 있는 목록이 몰래 바뀐다.
  it("원본 목록의 순서를 건드리지 않는다", () => {
    const pool = [place("먼곳", 400), place("중간", 300), place("가까운곳", 100)];
    pickPlaces(pool, 3, [], fixed(0.9, 0.5, 0));
    expect(pool.map((found) => found.name)).toEqual(["먼곳", "중간", "가까운곳"]);
  });
});

function placeAt(id: string, distance: number): Place {
  return {
    id, name: `가게${id}`, cuisineId: "gogi", distance,
    roadAddress: "길", phone: "", placeUrl: "", lat: 37.4, lng: 127.0,
  };
}

// 20곳 중 앞의 8곳만 가깝고 나머지는 멀다.
const spread = [
  ...Array.from({ length: 8 }, (_, i) => placeAt(`near${i}`, 50 + i * 10)),
  ...Array.from({ length: 12 }, (_, i) => placeAt(`far${i}`, 400 + i * 20)),
];

/** 시험용 난수. 같은 씨앗이면 언제나 같은 수열을 준다. */
function makeRng(seed: number): Rng {
  let state = seed + 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("가까운 곳 창", () => {
  // 이 시험이 이 작업의 핵심이다. 없으면 5m 거리에 가게를 두고 326m를 권한다.
  it("표본이 넓어도 처음에는 가까운 여덟 곳 안에서만 뽑는다", () => {
    // 난수를 여러 번 다르게 주어도 먼 곳이 섞이지 않아야 한다.
    for (let seed = 0; seed < 20; seed += 1) {
      const rng = makeRng(seed);
      const picked = pickPlaces(spread, 4, [], rng);
      for (const place of picked) {
        expect(place.id.startsWith("near")).toBe(true);
      }
    }
  });

  it("창을 넓히면 먼 곳도 나온다", () => {
    const wide = pickPlaces(spread, 4, [], makeRng(1), spread.length);
    // 창이 전체면 먼 곳이 섞일 수 있다. 적어도 뽑을 후보가 전체가 되었는지 본다.
    const anyFar = Array.from({ length: 30 }, (_, s) =>
      pickPlaces(spread, 4, [], makeRng(s), spread.length),
    ).flat();
    expect(anyFar.some((p) => p.id.startsWith("far"))).toBe(true);
    expect(wide).toHaveLength(4);
  });

  it("가게가 창보다 적으면 전체에서 뽑는다", () => {
    const few = spread.slice(0, 3);
    const picked = pickPlaces(few, 4, [], makeRng(0));
    expect(picked).toHaveLength(3);
  });

  it("돌려주는 목록은 가까운 순이다", () => {
    const picked = pickPlaces(spread, 4, [], makeRng(0));
    const distances = picked.map((p) => p.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("원본 목록의 순서를 건드리지 않는다", () => {
    const original = [...spread];
    pickPlaces(spread, 4, [], makeRng(0));
    expect(spread).toEqual(original);
  });
});
