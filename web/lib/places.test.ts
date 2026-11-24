import { describe, expect, it } from "vitest";
import type { Place } from "./api";
import type { Rng } from "./pick";
import { browsePrev, currentPage } from "./browse";
import { nearestWindow, nextPlaces, startPlaces } from "./places";

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

describe("startPlaces", () => {
  it("요청한 개수만큼만 고른다", () => {
    const pool = [
      place("가", 100),
      place("나", 200),
      place("다", 300),
      place("라", 400),
      place("마", 500),
      place("바", 600),
    ];
    expect(currentPage(startPlaces(pool, 4, zero).browse)).toHaveLength(4);
  });

  // 화면이 가게마다 거리(m)를 함께 보여주므로 순서가 뒤죽박죽이면 읽기 어렵다.
  // 일부러 먼 곳부터 담아 두었다 — 정렬이 빠지면 담은 순서 그대로 나와 실패한다.
  it("고른 가게를 가까운 순으로 돌려준다", () => {
    const pool = [place("먼곳", 400), place("중간", 300), place("가까운곳", 100)];
    expect(currentPage(startPlaces(pool, 3, zero).browse).map((found) => found.name)).toEqual([
      "가까운곳",
      "중간",
      "먼곳",
    ]);
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
    expect(currentPage(startPlaces(pool, 2, zero).browse).map((found) => found.name)).toEqual(["가", "나"]);
    expect(currentPage(startPlaces(pool, 2, fixed(0.9)).browse).map((found) => found.name)).toEqual([
      "가",
      "바",
    ]);
  });

  // 이 서비스가 실제로 부딪히는 상황이다. 가장 가까운 45곳 안에서
  // 샐러드로 분류된 가게가 한 곳뿐인 자리가 있었다(2026-09-06 홍대입구역 실측).
  it("가게가 요청 개수보다 적으면 있는 만큼만 돌려준다", () => {
    const pool = [place("샐러디", 121)];
    expect(currentPage(startPlaces(pool, 4, zero).browse).map((found) => found.name)).toEqual(["샐러디"]);
  });

  // 원본을 건드리면 화면이 들고 있는 목록이 몰래 바뀐다.
  it("원본 목록의 순서를 건드리지 않는다", () => {
    const pool = [place("먼곳", 400), place("중간", 300), place("가까운곳", 100)];
    startPlaces(pool, 3, fixed(0.9, 0.5, 0));
    expect(pool.map((found) => found.name)).toEqual(["먼곳", "중간", "가까운곳"]);
  });
});

function placeAt(id: string, distance: number): Place {
  return {
    id, name: `가게${id}`, cuisineId: "gogi", distance,
    roadAddress: "길", phone: "", placeUrl: "", lat: 37.4, lng: 127.0,
  };
}

/**
 * 20곳 중 여덟 곳(near0~7)이 가깝고 나머지(far0~11)는 먼 목록.
 *
 * 먼 것을 배열 앞에 두는 이유: 정렬을 통째로 빼먹고 "배열 앞에서부터 windowSize개
 * 자르기"로 바꿔도, 애초에 배열 순서가 거리순이면 결과가 우연히 똑같아 시험이
 * 못 잡는다. 먼 가게를 앞에 두면 정렬이 빠지는 순간 far0~far7이 창 안에 들어와
 * "표본이 넓어도 처음에는 가까운 여덟 곳 안에서만 뽑는다" 시험이 바로 실패한다.
 *
 * **상수가 아니라 함수인 이유**: 하나를 여러 시험이 나눠 쓰면 제자리 정렬 결함을
 * 넣어도 앞선 시험이 먼저 그 배열을 정렬해 버려, 뒤 시험이 시작될 때는 이미
 * 정렬된 뒤라 실패하지 못한다. 시험마다 자기 배열을 새로 만든다.
 */
function makeSpread(): Place[] {
  return [
    ...Array.from({ length: 12 }, (_, i) => placeAt(`far${i}`, 400 + i * 20)),
    ...Array.from({ length: 8 }, (_, i) => placeAt(`near${i}`, 50 + i * 10)),
  ];
}

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
    const spread = makeSpread();
    // 난수를 여러 번 다르게 주어도 먼 곳이 섞이지 않아야 한다.
    for (let seed = 0; seed < 20; seed += 1) {
      const picked = currentPage(startPlaces(spread, 4, makeRng(seed)).browse);
      for (const place of picked) {
        expect(place.id.startsWith("near")).toBe(true);
      }
    }
  });

  it("창을 넓히면 먼 곳도 나온다", () => {
    const spread = makeSpread();
    const wide = nearestWindow(spread, spread.length, 4);
    // 창이 전체면 먼 곳이 섞일 수 있다. 적어도 뽑을 후보가 전체가 되었는지 본다.
    expect(wide).toHaveLength(spread.length);
    expect(wide.some((p) => p.id.startsWith("far"))).toBe(true);
  });

  it("가게가 창보다 적으면 전체에서 뽑는다", () => {
    const spread = makeSpread();
    // 일부러 거리순이 아닌 셋을 준다(500m·50m·400m). 이미 정렬된 셋을 주면
    // "창 계산을 건너뛰고 원본 앞에서부터 잘라 주기"로 바꿔도 결과가 우연히
    // 같아 못 잡는다.
    const few = ["far5", "near0", "far0"].map(
      (id) => spread.find((p) => p.id === id)!,
    );
    const picked = currentPage(startPlaces(few, 4, makeRng(0)).browse);
    expect(picked).toHaveLength(3);
    // 셋뿐인 목록이니 그 셋이 그대로, 가까운 순으로 나와야 한다.
    expect(picked.map((p) => p.id)).toEqual(["near0", "far0", "far5"]);
  });

  it("돌려주는 목록은 가까운 순이다", () => {
    const picked = currentPage(startPlaces(makeSpread(), 4, makeRng(0)).browse);
    const distances = picked.map((p) => p.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  // Math.max(windowSize, count) 보호가 빠지면, windowSize가 count보다 작을 때
  // 후보가 요청 개수보다 짧아져 4곳을 채우지 못하고 2곳만 돌아온다.
  it("windowSize가 count보다 작아도 요청한 개수를 채운다", () => {
    expect(nearestWindow(makeSpread(), 2, 4)).toHaveLength(4);
  });

  it("nearestWindow는 pool의 객체를 그대로 담고 pool 순서를 건드리지 않는다", () => {
    const spread = makeSpread();
    const before = spread.slice();
    const window = nearestWindow(spread, 8, 4);
    expect(window.every((p) => spread.includes(p))).toBe(true);
    expect(spread).toEqual(before);
    expect(window.map((p) => p.id)).toEqual(Array.from({ length: 8 }, (_, i) => `near${i}`));
  });
});

describe("nextPlaces", () => {
  function makePool(n: number): Place[] {
    return Array.from({ length: n }, (_, i) => placeAt(`p${i}`, 10 + i * 10));
  }

  it("새 묶음을 뽑을 때만 범위를 넓힌다", () => {
    const pool = makePool(30);
    const rng = makeRng(3);
    let state = startPlaces(pool, 4, rng);
    expect(state.windowSize).toBe(8);
    state = nextPlaces(state, pool, 4, rng);
    state = nextPlaces(state, pool, 4, rng);
    expect(state.windowSize).toBe(24);
    state = { ...state, browse: browsePrev(state.browse) };
    state = nextPlaces(state, pool, 4, rng);
    expect(state.windowSize).toBe(24);
  });

  it("한 바퀴 동안 같은 가게가 두 번 나오지 않는다", () => {
    const pool = makePool(30);
    const rng = makeRng(5);
    let state = startPlaces(pool, 4, rng);
    for (let i = 0; i < 6; i += 1) state = nextPlaces(state, pool, 4, rng);
    const all = state.browse.pages.flat();
    expect(all).toHaveLength(28);
    expect(new Set(all).size).toBe(28);
  });

  it("범위가 처음부터 pool 전체면 둘째 묶음에 남은 가게가 모두 들어간다", () => {
    const pool = makePool(6);
    const rng = makeRng(7);
    const first = startPlaces(pool, 4, rng);
    const second = currentPage(nextPlaces(first, pool, 4, rng).browse);
    const firstPage = currentPage(first.browse);
    for (const left of pool.filter((p) => !firstPage.includes(p))) {
      expect(second).toContain(left);
    }
  });

  it("묶음은 가까운 순이다", () => {
    const pool = makePool(30);
    const rng = makeRng(9);
    let state = startPlaces(pool, 4, rng);
    for (let i = 0; i < 5; i += 1) {
      state = nextPlaces(state, pool, 4, rng);
      const d = currentPage(state.browse).map((p) => p.distance);
      expect(d).toEqual([...d].sort((a, b) => a - b));
    }
  });

  it("pool의 객체를 그대로 담는다", () => {
    const pool = makePool(30);
    const rng = makeRng(11);
    let state = startPlaces(pool, 4, rng);
    state = nextPlaces(state, pool, 4, rng);
    for (const p of currentPage(state.browse)) expect(pool.includes(p)).toBe(true);
  });
});
