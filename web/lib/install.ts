import type { Store } from "./visits";

/**
 * 판정에 쓰는 브라우저 값만 추린 모양.
 *
 * navigator·window를 직접 읽지 않고 인자로 받는 이유: 시험이 브라우저 없이 node에서
 * 돌기 때문이다(visits.ts가 저장소를 인자로 받는 것과 같은 이유다).
 */
export type InstallEnv = {
  userAgent: string;
  /** 홈 화면에서 열렸는지. display-mode: standalone 이거나 navigator.standalone === true */
  standalone: boolean;
  maxTouchPoints: number;
  /** 브라우저의 설치 신호를 받아 들고 있고 아직 쓰지 않았는지 */
  hasPrompt: boolean;
};

/**
 * 홈 화면 추가 안내를 어떻게 보여 줄지 가르는 다섯 상황.
 *
 * - installed: 이미 홈 화면에서 열렸다. 아무것도 보여 주지 않는다.
 * - in-app: 다른 앱(카카오톡 등) 안에서 열린 화면이다. 여기서는 추가할 수 없으므로
 *   바깥 브라우저에서 열라고 안내한다.
 * - prompt: 브라우저가 설치 신호를 보내 주었다. 버튼 한 번으로 설치 확인 창을 띄울 수 있다.
 * - ios: 아이폰·아이패드다. 웹사이트가 설치 창을 띄울 수 없어 순서를 글로 안내한다.
 * - none: 그 밖. 눌러도 아무 일도 일어나지 않는 버튼을 보여 주지 않으려고 안내를 감춘다.
 */
export type InstallKind = "installed" | "in-app" | "prompt" | "ios" | "none";

/** 안내를 보여 주는 상황. */
export type OfferKind = "in-app" | "prompt" | "ios";

/** 설치를 어디서 눌렀는지. 결과 화면의 권유 상자인지, 시작 화면의 링크인지. */
export type InstallOrigin = "result" | "start";

/** lib.dom에 없는 beforeinstallprompt 이벤트의 모양. */
export type InstallPromptEvent = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * 다른 앱 안에서 열린 화면이 자기 이름표(User-Agent)에 넣는 글자.
 *
 * **아직 어느 것도 실제 기기로 확인하지 않았다.** 전부 널리 알려진 표기를 기억에 기대어
 * 적은 것이고, 실제 기기로 확인하려는 것은 카카오톡뿐이다(확인하면 이 주석과 README의
 * "지금 아는 한계"를 함께 고친다). 표기가 틀렸거나 앱이 표기를 바꾸면 그 앱 안에서는 ios나 none으로 판정된다. 그때 사용자는
 * 따라 해도 되지 않는 순서 안내를 보거나 안내를 아예 못 보게 되지만, 서비스 자체는 그대로 쓸 수 있다.
 */
export const IN_APP_MARKERS: readonly string[] = [
  "KAKAOTALK",
  "NAVER(inapp",
  "DaumApps",
  "Instagram",
  "FBAN",
  "FBAV",
  "Line/",
];

function isIos(env: InstallEnv): boolean {
  if (/iPad|iPhone|iPod/.test(env.userAgent)) {
    return true;
  }
  // 아이패드는 자신을 Mac이라고 알린다. 손가락으로 누르는 Mac은 없으므로 터치 지점으로 가른다.
  return env.userAgent.includes("Macintosh") && env.maxTouchPoints > 1;
}

/**
 * 지금 어떤 상황인지. 앞의 조건이 맞으면 뒤는 보지 않는다.
 *
 * in-app이 prompt·ios보다 앞인 이유: 아이폰의 카카오톡 안에서 열린 화면은 아이폰이기도
 * 하지만, 거기서 순서 안내를 따라 해도 홈 화면에 추가할 수 없다.
 */
export function installKind(env: InstallEnv): InstallKind {
  if (env.standalone) {
    return "installed";
  }
  if (IN_APP_MARKERS.some((marker) => env.userAgent.includes(marker))) {
    return "in-app";
  }
  if (env.hasPrompt) {
    return "prompt";
  }
  if (isIos(env)) {
    return "ios";
  }
  return "none";
}

export function isOfferKind(kind: InstallKind): kind is OfferKind {
  return kind === "in-app" || kind === "prompt" || kind === "ios";
}

/**
 * 브라우저의 설치 확인 창이 닫힌 결과를 "안내를 닫았다"로 남길지.
 *
 * 결과 화면의 상자는 우리가 먼저 권한 것이라, 거기서 취소한 것은 권유를 거절한 것이다.
 * 시작 화면의 링크는 사용자가 스스로 누른 것이라, 취소해도 권유를 거절한 것이 아니다.
 */
export function recordsDismissal(
  origin: InstallOrigin,
  outcome: "accepted" | "dismissed",
): boolean {
  return origin === "result" && outcome === "dismissed";
}

/**
 * 결과 화면의 안내 상자를 닫았다는 표시를 담는 열쇠. 기록(STORAGE_KEY)·회피 설정
 * (AVOID_KEY)과 **다른 열쇠**를 쓴다.
 *
 * 까닭은 AVOID_KEY와 같다(visits.ts). 기록 항목에 무엇을 담을 수 있는지는 카카오 약관이
 * 정한 것이고, 이 값은 사용자가 만든 설정이지 조회 결과가 아니다. 기록을 "전체 지우기"로
 * 지워도 이 값은 남는다.
 */
export const INSTALL_DISMISSED_KEY = "random-choice.install-dismissed.v1";

const DISMISSED = "1";

/** 안내를 닫은 적이 있는지. 저장소가 없거나 읽지 못하면 닫지 않은 것으로 본다. */
export function readInstallDismissed(store: Store | null): boolean {
  if (store === null) {
    return false;
  }
  try {
    return store.getItem(INSTALL_DISMISSED_KEY) === DISMISSED;
  } catch {
    return false;
  }
}

export function writeInstallDismissed(store: Store | null): void {
  if (store === null) {
    return;
  }
  try {
    store.setItem(INSTALL_DISMISSED_KEY, DISMISSED);
  } catch {
    // 저장하지 못했다. 이번 방문에서는 화면의 값이 맞으므로 그대로 쓴다.
  }
}
