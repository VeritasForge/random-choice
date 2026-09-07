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
 * 회피 스위치를 켰는지 껐는지를 담는 열쇠. 기록과 **다른 열쇠**를 쓴다.
 *
 * 기록 항목(Visit)에 필드를 하나 더하는 방법도 있지만 그러면 안 된다. Visit에
 * 무엇을 담을 수 있는지는 카카오 약관이 정한 것이고(설계 문서 9절), 그 셋 말고
 * 다른 것을 얹기 시작하면 그 경계가 흐려진다. 설정은 사용자가 만든 값이지
 * 조회 결과가 아니므로 아예 따로 둔다.
 *
 * 기록을 "전체 지우기"로 지워도 이 값은 남는다. 지우는 대상은 다녀온 곳이지
 * 사용자가 고른 설정이 아니다.
 */
export const AVOID_KEY = "random-choice.avoid.v1";

/**
 * 기록을 보관하는 날짜 수.
 *
 * 회피 규칙은 자기 상수를 따로 선언하지 말고 이 값을 그대로 가져다 써야 한다.
 * 두 곳에 각자 값을 두면 나중에 한쪽만 바뀌어, 기록 화면에는 "정한 곳"으로
 * 보이는데 정작 회피에는 안 쓰이는(또는 그 반대인) 항목이 생긴다. 이 값을
 * 가져다 쓰는 한 기록 화면은 항상 "지금 빼고 있는 것"의 목록과 같다.
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

/**
 * 보관 기간이 지난 기록을 뺀다.
 *
 * 읽을 때만 이렇게 걸러서는 안 된다. recordVisit·forgetVisit도 이걸 거쳐야
 * 저장소에 쓰기 전에 만료된 항목이 빠진다 — 그러지 않으면 읽을 때는 안 보이는
 * 기록이 쓸 때마다 그대로 다시 저장되어 저장소가 끝없이 커진다.
 */
function withoutExpired(visits: Visit[], now: Date): Visit[] {
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  return visits.filter((v) => Date.parse(v.at) >= cutoff);
}

/** 보관 기간 안에 있는 기록만 돌려준다. 최근에 정한 것이 앞에 온다. */
export function readVisits(store: Store | null, now: Date = new Date()): Visit[] {
  return withoutExpired(load(store), now).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
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
  const kept = withoutExpired(load(store), now).filter((v) => v.placeId !== placeId);
  save(store, [...kept, { placeId, placeName, at: now.toISOString() }]);
}

/**
 * 방금 지운 기록을 되돌린다.
 *
 * withoutExpired를 거치는 이유는 recordVisit·forgetVisit과 같다: 쓰기 전에 걸러야
 * 저장소가 끝없이 커지지 않는다(위 withoutExpired 주석 참고). 되돌리는 항목도
 * 예외가 아니다 — "지우기"를 누른 채로 보관 기간을 넘겨 오래 열어 둔 화면에서
 * "되돌리기"를 누르면, 이미 기간이 지난 기록을 되살리는 셈이 되기 때문이다.
 *
 * 같은 장소 ID를 먼저 걸러 내는 이유: 거르지 않으면 같은 가게가 목록에 두 번
 * 나온다. **거를 때 남는 쪽은 되돌리는 옛 기록이지 저장소에 있던 새 기록이
 * 아니다** — 되돌리기는 지우기 이전 상태로 돌아가는 것이므로 원래 `at`이 맞다.
 * recordVisit이 반대로 새 기록을 남기는 것과 헷갈리지 않아야 한다(그쪽은 "다시
 * 정한 시각"을 남기는 것이 맞고, 이쪽은 "지우기 전 시각"을 되살리는 것이 맞다 —
 * 서로 다른 규칙이다).
 *
 * 한 탭 안에서는 이 충돌에 실제로 닿지 않는다. 기록은 결과 화면에서만 새로
 * 생기는데, 그 화면에 가려면(처음부터 다시·다른 종류 고르기 등) `onBack`을
 * 거치고, `onBack`이 되돌릴 목록을 비운다(app/page.tsx). 닿는 경우는 두 탭이
 * 같은 저장소를 볼 때뿐이다 — 한 탭에서 지운 가게를 다른 탭에서 방금 다시
 * 정했는데, 첫 탭에서 되돌리기를 누르면 되돌리는 쪽이 이겨서 새로 정한 기록의
 * 날짜가 과거로(지우기 전 시각으로) 돌아간다.
 */
export function restoreVisits(
  store: Store | null,
  restored: readonly Visit[],
  now: Date = new Date(),
): void {
  // 되돌릴 것이 없으면 저장소를 건드리지 않는다.
  if (restored.length === 0) {
    return;
  }
  const restoredIds = new Set(restored.map((v) => v.placeId));
  // 지금 저장된 것 중 되돌릴 ID와 겹치는 것을 빼고, 되돌릴 것을 붙인 뒤,
  // 만료된 것을 걸러 저장한다.
  const kept = load(store).filter((v) => !restoredIds.has(v.placeId));
  save(store, withoutExpired([...kept, ...restored], now));
}

/** now는 readVisits·recordVisit과 같은 이유로 받는다: 시험이 실제 시계 없이 돈다. */
export function forgetVisit(store: Store | null, placeId: string, now: Date = new Date()): void {
  save(store, withoutExpired(load(store), now).filter((v) => v.placeId !== placeId));
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

/**
 * 회피 스위치가 켜져 있는지 읽는다. 저장된 것이 없거나 읽지 못하면 켜짐(true)이다.
 *
 * **기본값이 켜짐인 이유**: 이 서비스의 목적이 늘 같은 것을 고르는 관성을 깨는
 * 것이라, 아무 설정도 하지 않은 사람에게 그 동작이 기본으로 가야 한다.
 *
 * **저장하는 이유**: 하루 한 번 쓰는 서비스라 이 값이 세션에만 남으면 껐던 사람이
 * 다음 날 말없이 켜진 화면을 본다. 그런데 기록 화면은 켜짐/꺼짐을 영구 설정처럼
 * 보여 주므로, 저장하지 않으면 화면이 거짓말을 하는 셈이 된다.
 *
 * boolean이 아닌 값은 전부 켜짐으로 본다. 사람이 손으로 고쳤거나 다른 판본이
 * 남긴 값일 텐데, 그것을 "꺼짐"으로 읽으면 사용자가 끈 적 없는 회피가 꺼진다 —
 * 조용히 기능이 사라지는 쪽보다 켜져 있는 쪽이 되돌리기 쉽다.
 */
export function readAvoidOn(store: Store | null): boolean {
  if (store === null) {
    return true;
  }
  try {
    const raw = store.getItem(AVOID_KEY);
    if (raw === null) {
      return true;
    }
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "boolean" ? parsed : true;
  } catch {
    return true;
  }
}

/** 회피 스위치 상태를 저장한다. 저장이 막혀 있어도 조용히 넘어간다(save와 같은 까닭). */
export function writeAvoidOn(store: Store | null, on: boolean): void {
  if (store === null) {
    return;
  }
  try {
    store.setItem(AVOID_KEY, JSON.stringify(on));
  } catch {
    // 저장하지 못했다. 이번 세션에서는 화면의 값이 맞으므로 그대로 쓴다.
  }
}
