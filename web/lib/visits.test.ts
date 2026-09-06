import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVOID_KEY, browserStore, forgetAll, forgetVisit, readAvoidOn, readVisits, recordVisit,
  RETENTION_DAYS, STORAGE_KEY, writeAvoidOn, type Store,
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

  // readVisits로 확인하면 이 방어가 있든 없든 통과한다 — 만료된 항목은 읽을 때
  // 어차피 걸러지기 때문이다. 그래서 저장소에 실제로 쓰인 원본 JSON을 직접 본다.
  it("정할 때 보관 기간 지난 기록은 저장소에서도 함께 지운다", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify([
        { placeId: "old", placeName: "옛가게", at: daysAgo(RETENTION_DAYS + 1).toISOString() },
        { placeId: "fresh", placeName: "최근가게", at: daysAgo(1).toISOString() },
      ]),
    });
    recordVisit(store, "new", "새가게", NOW);
    const raw = JSON.parse(store.data[STORAGE_KEY]) as { placeId: string }[];
    expect(raw.map((v) => v.placeId)).toEqual(["fresh", "new"]);
  });

  it("지울 때도 보관 기간 지난 기록은 저장소에서 함께 지운다", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify([
        { placeId: "old", placeName: "옛가게", at: daysAgo(RETENTION_DAYS + 1).toISOString() },
        { placeId: "p1", placeName: "가게1", at: daysAgo(1).toISOString() },
        { placeId: "p2", placeName: "가게2", at: daysAgo(1).toISOString() },
      ]),
    });
    forgetVisit(store, "p1", NOW);
    const raw = JSON.parse(store.data[STORAGE_KEY]) as { placeId: string }[];
    expect(raw.map((v) => v.placeId)).toEqual(["p2"]);
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

describe("회피 스위치 저장", () => {
  it("저장된 것이 없으면 켜짐이다", () => {
    // 아무 설정도 하지 않은 사람에게 이 서비스의 목적(관성 깨기)이 기본으로 가야 한다.
    expect(readAvoidOn(fakeStore())).toBe(true);
  });

  it("끈 것을 저장하고 그대로 다시 읽는다", () => {
    const store = fakeStore();
    writeAvoidOn(store, false);
    expect(readAvoidOn(store)).toBe(false);
  });

  it("껐다가 다시 켠 것도 그대로 읽는다", () => {
    // false만 확인하면 "항상 false를 돌려주는" 구현도 통과한다.
    const store = fakeStore();
    writeAvoidOn(store, false);
    writeAvoidOn(store, true);
    expect(readAvoidOn(store)).toBe(true);
  });

  // 기록과 설정을 한 열쇠에 담으면 "전체 지우기"가 설정까지 지운다.
  // 지우는 대상은 다녀온 곳이지 사용자가 고른 설정이 아니다.
  it("기록을 전부 지워도 스위치 설정은 남는다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "가게1", NOW);
    writeAvoidOn(store, false);
    forgetAll(store);
    expect(readVisits(store, NOW)).toHaveLength(0);
    expect(readAvoidOn(store)).toBe(false);
  });

  it("가게를 기록해도 스위치 설정을 덮어쓰지 않는다", () => {
    const store = fakeStore();
    writeAvoidOn(store, false);
    recordVisit(store, "p1", "가게1", NOW);
    expect(readAvoidOn(store)).toBe(false);
  });

  it("읽기가 예외를 던지면 켜짐으로 본다", () => {
    expect(readAvoidOn(throwingStore())).toBe(true);
  });

  it("쓰기가 예외를 던져도 터지지 않는다", () => {
    expect(() => writeAvoidOn(throwingStore(), false)).not.toThrow();
  });

  it("저장소가 없어도(null) 켜짐으로 보고 터지지 않는다", () => {
    expect(readAvoidOn(null)).toBe(true);
    expect(() => writeAvoidOn(null, false)).not.toThrow();
  });

  // 사람이 손으로 고쳤거나 다른 판본이 남긴 값이다. 이것을 "꺼짐"으로 읽으면
  // 사용자가 끈 적 없는 회피가 조용히 꺼진다.
  it("JSON이 아니면 켜짐으로 본다", () => {
    expect(readAvoidOn(fakeStore({ [AVOID_KEY]: "{{{" }))).toBe(true);
  });

  it("boolean이 아닌 값이면 켜짐으로 본다", () => {
    // "false"라는 **문자열**은 JSON으로 읽히기는 하지만 boolean이 아니다.
    // 타입 검사 없이 그대로 돌려주면 문자열 "false"가 참으로 취급되어
    // 화면에는 켜짐으로 보이는데 값은 문자열인 어긋난 상태가 된다.
    expect(readAvoidOn(fakeStore({ [AVOID_KEY]: JSON.stringify("false") }))).toBe(true);
    expect(readAvoidOn(fakeStore({ [AVOID_KEY]: JSON.stringify(0) }))).toBe(true);
    expect(readAvoidOn(fakeStore({ [AVOID_KEY]: JSON.stringify(null) }))).toBe(true);
  });
});

describe("브라우저 저장소 얻기", () => {
  // node에는 원래 localStorage가 없다(전역에 아예 없는 상태). 그래서 시험이 끝나면
  // "이전 값으로 되돌리기"가 아니라 "지워서 없던 상태로 되돌리기"가 맞다.
  // vi.unstubAllGlobals가 정확히 그 일을 한다.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("localStorage가 없는 환경에서는 null을 돌려준다", () => {
    // 시험은 node 환경에서 돈다. localStorage가 없다.
    expect(browserStore()).toBeNull();
  });

  it("localStorage가 있으면 그 저장소를 그대로 돌려준다", () => {
    const store = fakeStore();
    vi.stubGlobal("localStorage", store);
    // 감싸거나 복사한 것이 아니라 넘겨준 그 객체인지 참조로 확인한다.
    expect(browserStore()).toBe(store);
  });

  it("접근이 예외를 던지면 null을 돌려준다", () => {
    // 시크릿 창이나 저장소 차단 설정에서는 localStorage 자체는 있지만
    // 만지는 순간 예외를 던진다.
    vi.stubGlobal("localStorage", throwingStore());
    expect(browserStore()).toBeNull();
  });
});
