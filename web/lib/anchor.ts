/**
 * 음식점을 어디를 기준으로 찾을 것인가.
 *
 * 이름을 `origin`이 아니라 `anchor`로 둔 이유: 이 저장소에는 이미 `API_ORIGIN`이라는
 * 환경변수가 있어(web/app/api/v1/nearby/route.ts) 읽는 사람이 두 개념을 헷갈린다.
 */

import type { Store } from "./visits";

export type Anchor =
  | { kind: "here" }
  | { kind: "spot"; name: string; lat: number; lng: number };

/**
 * 사용자가 마지막으로 친 검색어를 담는 열쇠.
 *
 * **여기 담기는 것은 사용자가 친 글자 하나뿐이다.** 카카오가 돌려준 장소 이름도
 * 좌표도 담지 않는다. 카카오는 조회 결과의 저장을 금지하고, 담당자가 밝힌 예외는
 * "사용자가 직접 고른 장소의 장소식별값과 상호"까지여서 좌표는 그 문구에 없다
 * (설계 문서 4-5절). 사용자가 친 글자는 카카오 응답이 아니라 사용자가 만든
 * 입력이므로 이 경계와 무관하고, 회피 스위치(random-choice.avoid.v1)와 같은 성격이다.
 *
 * 판 번호(v1)를 붙이는 이유: 담는 모양이 바뀌면 옛 값을 읽다 깨지는 대신
 * 새 열쇠로 옮겨 갈 수 있다. 이 저장소의 다른 두 열쇠와 같은 규칙이다.
 */
export const KEYWORD_KEY = "random-choice.keyword.v1";

/**
 * 기준 위치 줄에 쓸 이름의 최대 길이. 넘으면 줄이고 말줄임표를 붙인다.
 *
 * 12인 근거(1단계 — 이 함수가 실제로 돌려주는 값만 기준): `anchorLabel`이
 * 돌려주는 값은 `<이름> 주변`까지다. 긴 이름인 `해운대블루라인파크 청사포정거장`
 * (16자)을 자르지 않으면 이 값은 19자가 되고, 12자로 자르면 16자가 된다.
 *
 * 2단계 — 화면에 실제로 보이는 줄: 화면은 이 값 뒤에 문구를 더 붙이고 옆에
 * `바꾸기` 단추를 두므로, 눈에 보이는 줄은 위 19자·16자보다 더 길다. 이 수를
 * 늘리려면 이 함수의 반환값이 아니라 그렇게 완성된 줄을 가장 좁은 화면에서
 * 직접 재 본 뒤에 바꾼다.
 */
const MAX_NAME = 12;

/**
 * 마지막으로 친 검색어를 읽는다. 없거나 읽지 못하면 null이다.
 *
 * 문자열이 아닌 값을 전부 null로 보는 이유: 그대로 화면에 그리면
 * `[object Object]로 다시 찾기` 같은 단추가 생긴다.
 */
export function readKeyword(store: Store | null): string | null {
  if (store === null) return null;
  try {
    const raw = store.getItem(KEYWORD_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 검색어를 저장한다. 앞뒤 공백을 떼고, 비면 아무것도 하지 않는다.
 *
 * 빈 값을 저장하지 않는 이유: 저장하면 시작 화면에 글자 없는 단추가 하나 생긴다.
 */
export function writeKeyword(store: Store | null, keyword: string): void {
  if (store === null) return;
  const trimmed = keyword.trim();
  if (trimmed === "") return;
  try {
    store.setItem(KEYWORD_KEY, JSON.stringify(trimmed));
  } catch {
    // 용량이 찼거나 저장이 막혔다. 사용자가 할 수 있는 일이 없으므로 조용히 넘어간다.
    // 이번 세션에서는 화면이 들고 있는 값이 맞으므로 그대로 쓴다.
  }
}

export function forgetKeyword(store: Store | null): void {
  if (store === null) return;
  try {
    store.removeItem(KEYWORD_KEY);
  } catch {
    // 지우지 못했다. 사용자가 할 수 있는 일이 없다.
  }
}

/**
 * 후보·결과 화면 위쪽에 그릴 기준 위치 문구.
 *
 * 이 판단을 화면 조각이 아니라 여기 두는 이유: 화면 시험은 브라우저 없이 돌아
 * .tsx 파일에 닿지 못한다. 줄이는 규칙을 컴포넌트에 두면 아무 시험도 지키지 못한다.
 */
export function anchorLabel(anchor: Anchor): string {
  if (anchor.kind === "here") {
    return "지금 있는 곳";
  }
  const name =
    anchor.name.length > MAX_NAME ? `${anchor.name.slice(0, MAX_NAME)}…` : anchor.name;
  return `${name} 주변`;
}
