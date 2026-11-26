import { kakaoPlaceUrl } from "./visits";

/*
  정한 가게를 다른 사람에게 보내는 링크와 글의 규칙.

  링크는 `/s/{장소 번호}?c={종류 식별자}` 꼴이다. 장소 번호는 카카오 가게 페이지 주소
  (https://place.map.kakao.com/12345678)의 끝에 붙은 숫자다.

  **가게 이름을 주소에 담지 않는다.** 주소는 누구나 고칠 수 있어서, 이름을 담으면 우리 주소
  아래에 아무 글자나 띄운 링크를 만들어 퍼뜨릴 수 있다. 가게 이름은 끼워 넣은 카카오 페이지가
  스스로 보여 주고, 보내는 글(shareText)에만 들어간다. 같은 이유로 가게 페이지 주소를 통째로
  받지도 않는다. 숫자만 받아 주소를 여기서 다시 짓는다.

  **종류 이름표가 화면 쪽에도 있는 이유.** 기존 화면은 서버가 조회 응답에 실어 준 이름을
  그리지만, 공유 화면은 서버를 부르지 않고 그린다. 그래서 식별자를 이름으로 바꾸는 표가
  이쪽에도 필요하다. 서버의 표(api/internal/cuisine/cuisine.go)와 어긋나지 않는지는
  share.test.ts가 그 소스를 직접 읽어 대조한다.
*/

/** 장소 번호로 받아 주는 가장 긴 길이. 실제 번호보다 넉넉하고, 터무니없이 긴 값은 막는다. */
export const MAX_PLACE_NUMBER_LENGTH = 20;

const PLACE_NUMBER = new RegExp(`^[0-9]{1,${MAX_PLACE_NUMBER_LENGTH}}$`);
const PLACE_URL_BASE = "https://place.map.kakao.com/";

/**
 * 종류 식별자 → 화면에 보이는 이름.
 *
 * 객체가 아니라 Map인 이유: 주소에서 온 값으로 찾는데, 객체는 "constructor"나 "toString" 같은
 * 기본 속성 이름에도 값을 돌려준다.
 */
export const CUISINE_LABELS: ReadonlyMap<string, string> = new Map([
  ["dak", "닭요리"],
  ["gogi", "고기·구이"],
  ["hoe", "회·해물"],
  ["myeon", "면·국수"],
  ["gukbap", "국밥·탕"],
  ["bapjip", "밥집·백반"],
  ["donkatsu", "돈까스·우동"],
  ["ilsik", "일식·초밥"],
  ["jungsik", "중식"],
  ["bunsik", "분식"],
  ["burger", "햄버거"],
  ["yangsik", "양식·파스타"],
  ["salad", "샐러드·샌드위치"],
  ["asia", "아시아 음식"],
  ["shabu", "샤브샤브"],
  ["fusion", "퓨전"],
  ["dosirak", "도시락"],
  ["bbang", "빵·간식"],
]);

/** 아는 종류의 이름. 모르는 값이면 null. */
export function cuisineLabel(id: unknown): string | null {
  return typeof id === "string" ? (CUISINE_LABELS.get(id) ?? null) : null;
}

/**
 * 카카오 가게 페이지 주소에서 장소 번호를 얻는다. 얻지 못하면 null.
 *
 * 카카오는 주소를 비워 보내기도 하고, 가게 페이지가 아닌 꼴을 보낼 수도 있다. 그런 가게로는
 * 열리는 링크를 만들 수 없으므로 null을 돌려주고, 부르는 쪽은 `보내기`를 숨긴다.
 */
export function placeNumber(placeUrl: unknown): string | null {
  const url = kakaoPlaceUrl(placeUrl);
  if (url === null) {
    return null;
  }
  const candidate = new URL(url).pathname.slice(1);
  return PLACE_NUMBER.test(candidate) ? candidate : null;
}

/** 공유 화면의 경로. 앞에 붙일 주소(origin)는 부르는 쪽이 안다. */
export function sharePath(placeNo: string, cuisineId: string): string {
  return `/s/${placeNo}?c=${encodeURIComponent(cuisineId)}`;
}

/** 링크에서 읽어 낸 것. 종류를 모르면 두 칸이 함께 null이다. */
export type Share = {
  placeNo: string;
  /** kakaoPlaceUrl을 통과한 가게 페이지 주소. href와 iframe src에 그대로 쓴다. */
  placeUrl: string;
  cuisineId: string | null;
  cuisineLabel: string | null;
};

/**
 * 공유 링크의 두 값을 읽는다. 장소 번호가 틀리면 null(없는 페이지).
 *
 * 종류가 표에 없거나, 없거나, 여러 번 온 것은 오류가 아니다. 종류 없이 가게만 보여 준다.
 * 서버의 종류 표가 바뀌거나 화면과 서버의 배포 시점이 어긋나도 링크가 죽지 않게 하려는 것이다.
 */
export function parseShare(placeNo: string, c: string | string[] | undefined): Share | null {
  if (!PLACE_NUMBER.test(placeNo)) {
    return null;
  }
  const placeUrl = kakaoPlaceUrl(PLACE_URL_BASE + placeNo);
  if (placeUrl === null) {
    return null;
  }
  const label = cuisineLabel(c);
  return {
    placeNo,
    placeUrl,
    cuisineId: label === null ? null : (c as string),
    cuisineLabel: label,
  };
}

/** 보내는 글. 가게 이름 뒤에 조사를 붙이지 않는 꼴이라 받침에 따라 틀릴 일이 없다. */
export function shareText(cuisineLabel: string, placeName: string): string {
  return `오늘은 ${cuisineLabel}, ${placeName} 어때요?`;
}

/**
 * `보내기`를 누른 결과.
 * - shared: 휴대폰의 공유 창으로 넘겼다.
 * - cancelled: 사용자가 공유 창을 그냥 닫았다. 오류가 아니다.
 * - copied: 공유 창을 쓸 수 없어 글과 주소를 복사했다.
 * - failed: 복사도 하지 못했다. 화면이 주소를 글자로 보여 줘야 한다.
 */
export type ShareOutcome = "shared" | "cancelled" | "copied" | "failed";

/**
 * 브라우저가 해 주는 두 가지 일. 없는 것은 비워 둔다.
 * 인자로 받는 이유는 시험이 브라우저 없이 가짜를 넣을 수 있게 하려는 것이다.
 */
export type ShareDeps = {
  share?: (data: { text: string; url: string }) => Promise<void>;
  copy?: (text: string) => Promise<void>;
};

/**
 * 공유 창을 열고, 열 수 없으면 복사한다.
 *
 * 닫은 것과 실패한 것을 가르는 이유: 닫은 것은 사용자가 보내지 않기로 한 것이라 아무 일도
 * 하지 않는 것이 맞다. 그때 복사까지 하면 취소한 사람에게 "복사했어요"가 뜬다. 반대로 공유 창이
 * 있는데 브라우저가 받아 주지 않은 경우(다른 앱 안의 화면에서 그럴 수 있다)에 아무 일도 하지
 * 않으면 버튼이 고장 난 것으로 보인다. 그래서 그때는 복사로 넘어간다.
 */
export async function sendShare(
  text: string,
  url: string,
  deps: ShareDeps,
): Promise<ShareOutcome> {
  if (deps.share !== undefined) {
    try {
      await deps.share({ text, url });
      return "shared";
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  if (deps.copy === undefined) {
    return "failed";
  }
  try {
    await deps.copy(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

/** 공유 화면의 제목. 브라우저 탭과 링크 미리보기가 함께 쓴다. */
export function shareTitle(cuisineLabel: string | null): string {
  return cuisineLabel === null ? "오늘 점심, 여기 어때요?" : `오늘은 ${cuisineLabel}`;
}
