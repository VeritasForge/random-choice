/**
 * 사용자가 "여기로 정했어요"를 누른 가게의 기록.
 *
 * **무엇을 저장하는가가 이 파일의 전부다.** 카카오는 응답 결과의 저장을 금지하지만,
 * 사용자가 직접 찜하거나 담은 장소의 장소ID·상호는 저장을 명시적으로 허용했다
 * (설계 문서 9절에 담당자 답변 원문이 있다). 그래서 여기 담기는 것은 셋뿐이다.
 *
 * **음식 종류는 넣지 않는다.** 종류 식별자는 카카오 분류 문자열을 입력으로 계산해 낸
 * 값이라 "응답에 기반한 가공 데이터"로 읽힐 여지가 있고, 종류 회피 자체가 효과의
 * 근거 없이 사용자를 교정하는 개입이라 이번 범위에서 뺐다. 나중에 편의로 한 줄
 * 더하고 싶어지면 그 두 이유를 먼저 다시 읽어야 한다.
 */

export type Visit = {
  placeId: string;
  placeName: string;
  /** ISO 8601 문자열. 우리가 만든 값이다. */
  at: string;
};

/**
 * 브라우저 저장소가 갖춰야 하는 최소한의 모양.
 *
 * localStorage를 직접 부르지 않고 인자로 받는 이유: 화면 시험이 브라우저 없이
 * node에서 돌기 때문이다. 추첨 함수들이 난수 생성기를 인자로 받는 것과 같은 이유다.
 */
export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const STORAGE_KEY = "random-choice.visits.v1";

/**
 * 기록을 보관하는 날짜 수.
 *
 * 회피 기간과 같은 값으로 둔다. 다르게 두면 기록 화면에 "정한 곳"으로 보이는데
 * 정작 회피에는 안 쓰이는 항목이 섞여, 사용자가 "목록에 있는데 왜 또 나오지?"
 * 하게 된다. 같으면 기록 화면이 곧 "지금 빼고 있는 것"의 목록이 된다.
 *
 * 14일이라는 수에 근거는 없다. "2주에 한 번은 같은 집에 가도 된다"는 감각일 뿐이고,
 * 지금 구조에는 계측이 없어서 이 값을 고칠 자료도 모이지 않는다(설계 문서 14절).
 */
export const RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 브라우저에서 부를 때 넘길 저장소. 접근 자체가 예외를 던지면 null이다. */
export function browserStore(): Store | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    // 접근만으로 예외를 던지는 설정이 있으므로 한 번 만져 본다.
    localStorage.getItem(STORAGE_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

function isVisit(value: unknown): value is Visit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Visit;
  return (
    typeof v.placeId === "string" &&
    v.placeId.length > 0 &&
    typeof v.placeName === "string" &&
    typeof v.at === "string" &&
    Number.isFinite(Date.parse(v.at))
  );
}

function load(store: Store | null): Visit[] {
  if (store === null) {
    return [];
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // 항목별로 거른다. 하나가 망가졌다고 전부 버리면 사용자 기록이 통째로 사라진다.
    return parsed.filter(isVisit);
  } catch {
    return [];
  }
}

function save(store: Store | null, visits: Visit[]): void {
  if (store === null) {
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch {
    // 용량이 찼거나 저장이 막혔다. 사용자가 할 수 있는 일이 없으므로 조용히 포기한다.
    // 기억 없는 상태로 계속 동작하는 것이 오류 화면을 띄우는 것보다 낫다.
  }
}

/** 보관 기간 안에 있는 기록만 돌려준다. 최근에 정한 것이 앞에 온다. */
export function readVisits(store: Store | null, now: Date = new Date()): Visit[] {
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  return load(store)
    .filter((v) => Date.parse(v.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * 사용자가 정한 가게를 기록한다.
 *
 * 장소 ID가 비면 아무것도 하지 않는다. 카카오는 ID가 빈 응답도 주는데,
 * 빈 문자열을 열쇠로 쓰면 그 뒤 회피 기간 내내 ID가 빈 모든 가게가 함께 사라진다.
 * 화면은 그런 가게에 "여기로 정했어요" 버튼을 아예 그리지 않는다.
 */
export function recordVisit(
  store: Store | null,
  placeId: string,
  placeName: string,
  now: Date = new Date(),
): void {
  if (placeId === "") {
    return;
  }
  const kept = load(store).filter((v) => v.placeId !== placeId);
  save(store, [...kept, { placeId, placeName, at: now.toISOString() }]);
}

export function forgetVisit(store: Store | null, placeId: string): void {
  save(store, load(store).filter((v) => v.placeId !== placeId));
}

export function forgetAll(store: Store | null): void {
  if (store === null) {
    return;
  }
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 지우지 못했다. 사용자가 할 수 있는 일이 없다.
  }
}
