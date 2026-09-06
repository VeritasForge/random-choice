import { describe, expect, it } from "vitest";
import {
  browserStore, forgetAll, forgetVisit, readVisits, recordVisit,
  RETENTION_DAYS, STORAGE_KEY, type Store,
} from "./visits";

/** 시험용 저장소. 실제 localStorage 대신 넘긴다. */
function fakeStore(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

/** 읽기와 쓰기 모두에서 예외를 던지는 저장소. 시크릿 창과 저장소 차단 설정을 흉내 낸다. */
function throwingStore(): Store {
  return {
    getItem: () => { throw new DOMException("접근이 거부되었습니다", "SecurityError"); },
    setItem: () => { throw new DOMException("용량을 초과했습니다", "QuotaExceededError"); },
    removeItem: () => { throw new DOMException("접근이 거부되었습니다", "SecurityError"); },
  };
}

const NOW = new Date("2026-09-06T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("기록 저장과 조회", () => {
  it("정한 가게를 기록하고 다시 읽는다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "연돈", NOW);
    const visits = readVisits(store, NOW);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ placeId: "p1", placeName: "연돈" });
  });

  it("같은 가게를 다시 정하면 날짜만 새로 쓴다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "연돈", daysAgo(5));
    recordVisit(store, "p1", "연돈", NOW);
    const visits = readVisits(store, NOW);
    expect(visits).toHaveLength(1);
    expect(visits[0].at).toBe(NOW.toISOString());
  });

  // 장소 ID가 빈 가게를 기록하면, 그 뒤 회피 기간 내내 ID가 빈 모든 가게가
  // 함께 사라진다. 카카오는 ID가 빈 응답도 주고 조회기는 그런 가게를 살려 둔다.
  it("장소 ID가 비면 기록하지 않는다", () => {
    const store = fakeStore();
    recordVisit(store, "", "이름없는가게", NOW);
    // 읽은 결과가 비었다는 것만 보면 이 방어를 확인할 수 없다. 읽기 쪽 항목 검사도
    // 빈 ID를 버리기 때문에, 기록 쪽 방어를 지워도 읽기 결과는 여전히 비어 보인다.
    // 그래서 저장소에 애초에 아무것도 쓰지 않았다는 것을 직접 확인한다.
    expect(store.data[STORAGE_KEY]).toBeUndefined();
    expect(readVisits(store, NOW)).toHaveLength(0);
  });

  it("보관 기간이 지난 기록은 읽을 때 사라진다", () => {
    const store = fakeStore();
    recordVisit(store, "old", "옛가게", daysAgo(RETENTION_DAYS + 1));
    recordVisit(store, "new", "새가게", daysAgo(1));
    const visits = readVisits(store, NOW);
    expect(visits.map((v) => v.placeId)).toEqual(["new"]);
  });

  // 기록 화면이 "최근에 정한 곳"부터 보여 줄 수 있어야 한다. 저장은 정한 순서대로
  // 뒤에 붙기 때문에, 읽을 때 뒤집지 않으면 오래된 것이 맨 위로 온다.
  it("최근에 정한 것이 앞에 온다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "가게1", daysAgo(3));
    recordVisit(store, "p2", "가게2", daysAgo(1));
    recordVisit(store, "p3", "가게3", daysAgo(2));
    expect(readVisits(store, NOW).map((v) => v.placeId)).toEqual(["p2", "p3", "p1"]);
  });

  it("한 줄씩 지운다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "가게1", NOW);
    recordVisit(store, "p2", "가게2", NOW);
    forgetVisit(store, "p1");
    expect(readVisits(store, NOW).map((v) => v.placeId)).toEqual(["p2"]);
  });

  it("전부 지운다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "가게1", NOW);
    forgetAll(store);
    expect(readVisits(store, NOW)).toHaveLength(0);
  });
});

describe("저장소가 말을 듣지 않을 때", () => {
  // 시크릿 창이나 저장소 차단 설정에서는 접근 자체가 예외를 던진다.
  // 그래도 서비스는 "기억 없는 상태"로 정상 동작해야 한다.
  it("읽기가 예외를 던져도 빈 목록을 돌려준다", () => {
    expect(readVisits(throwingStore(), NOW)).toEqual([]);
  });

  it("쓰기가 예외를 던져도 터지지 않는다", () => {
    expect(() => recordVisit(throwingStore(), "p1", "가게", NOW)).not.toThrow();
  });

  it("저장소가 없어도(null) 정상 동작한다", () => {
    expect(readVisits(null, NOW)).toEqual([]);
    expect(() => recordVisit(null, "p1", "가게", NOW)).not.toThrow();
    expect(() => forgetAll(null)).not.toThrow();
  });
});

describe("저장된 값이 망가졌을 때", () => {
  // 항목별로 검사해서 이상한 것만 버린다. 전부 버리면 사용자 기록이 통째로 사라진다.
  it("망가진 항목만 버리고 나머지는 살린다", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify([
        { placeId: "good", placeName: "멀쩡한가게", at: NOW.toISOString() },
        { placeId: 123, placeName: "숫자아이디", at: NOW.toISOString() },
        { placeName: "아이디없음", at: NOW.toISOString() },
        { placeId: "noname", at: NOW.toISOString() },
        { placeId: "nodate", placeName: "날짜없음" },
        { placeId: "baddate", placeName: "날짜이상", at: "어제" },
        // 날짜가 문자열이 아니면 Date.parse가 문자열로 바꿔 읽어 버려서
        // 날짜 검사만으로는 통과한다. 그래서 타입도 따로 본다.
        { placeId: "arraydate", placeName: "날짜가배열", at: [NOW.toISOString()] },
        "문자열",
        null,
      ]),
    });
    const visits = readVisits(store, NOW);
    expect(visits.map((v) => v.placeId)).toEqual(["good"]);
  });

  // 기록 쪽 방어가 없던 판본이 남겼거나 사람이 손으로 고친 값에는 빈 ID가 섞일 수 있다.
  // 그것이 살아남으면 보관 기간 내내 ID가 빈 모든 가게가 함께 사라진다.
  it("이미 저장된 값에 빈 장소 ID가 있으면 읽을 때 버린다", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify([
        { placeId: "", placeName: "이름없는가게", at: NOW.toISOString() },
        { placeId: "good", placeName: "멀쩡한가게", at: NOW.toISOString() },
      ]),
    });
    expect(readVisits(store, NOW).map((v) => v.placeId)).toEqual(["good"]);
  });

  it("JSON이 아니면 빈 목록을 돌려준다", () => {
    const store = fakeStore({ [STORAGE_KEY]: "{{{" });
    expect(readVisits(store, NOW)).toEqual([]);
  });

  it("배열이 아니면 빈 목록을 돌려준다", () => {
    const store = fakeStore({ [STORAGE_KEY]: JSON.stringify({ placeId: "p1" }) });
    expect(readVisits(store, NOW)).toEqual([]);
  });
});

describe("브라우저 저장소 얻기", () => {
  it("localStorage가 없는 환경에서는 null을 돌려준다", () => {
    // 시험은 node 환경에서 돈다. localStorage가 없다.
    expect(browserStore()).toBeNull();
  });
});
