import { describe, expect, it } from "vitest";
import {
  IN_APP_MARKERS, INSTALL_DISMISSED_KEY, installKind, isOfferKind, readInstallDismissed,
  recordsDismissal, writeInstallDismissed, type InstallEnv,
} from "./install";
import type { Store } from "./visits";

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

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const env = (over: Partial<InstallEnv>): InstallEnv =>
  ({ userAgent: ANDROID, standalone: false, maxTouchPoints: 5, hasPrompt: false, ...over });

describe("installKind", () => {
  it("홈 화면에서 열렸으면 다른 조건과 무관하게 installed", () => {
    expect(installKind(env({ standalone: true, hasPrompt: true }))).toBe("installed");
    expect(installKind(env({ standalone: true, userAgent: IPHONE }))).toBe("installed");
  });
  it("설치 신호를 들고 있으면 prompt", () => {
    expect(installKind(env({ hasPrompt: true }))).toBe("prompt");
  });
  it("설치 신호가 없거나 이미 쓴 안드로이드는 none", () => {
    expect(installKind(env({ hasPrompt: false }))).toBe("none");
  });
  it("아이폰은 ios", () => {
    expect(installKind(env({ userAgent: IPHONE }))).toBe("ios");
  });
  it("Mac이라고 알리지만 터치 지점이 둘 이상이면 아이패드로 보아 ios", () => {
    expect(installKind(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe("ios");
  });
  it("터치가 없는 진짜 Mac은 none", () => {
    expect(installKind(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }))).toBe("none");
  });
  it.each(IN_APP_MARKERS)("다른 앱 안에서 열렸으면(%s) 아이폰이어도 in-app", (marker) => {
    expect(installKind(env({ userAgent: `${IPHONE} ${marker}` }))).toBe("in-app");
    expect(installKind(env({ userAgent: `${ANDROID} ${marker}` }))).toBe("in-app");
  });
  it("판별 목록에 카카오톡이 들어 있다", () => {
    expect(IN_APP_MARKERS).toContain("KAKAOTALK");
  });
});

describe("isOfferKind", () => {
  it("안내를 보여 줄 상황은 셋뿐이다", () => {
    expect((["installed", "in-app", "prompt", "ios", "none"] as const).filter(isOfferKind))
      .toEqual(["in-app", "prompt", "ios"]);
  });
});

describe("recordsDismissal", () => {
  it("결과 화면에서 설치 확인 창을 취소했을 때만 닫음으로 남긴다", () => {
    expect(recordsDismissal("result", "dismissed")).toBe(true);
    expect(recordsDismissal("result", "accepted")).toBe(false);
    expect(recordsDismissal("start", "dismissed")).toBe(false);
    expect(recordsDismissal("start", "accepted")).toBe(false);
  });
});

describe("닫음 표시", () => {
  it("쓰기 전에는 false, 쓴 뒤에는 true", () => {
    const store = fakeStore();
    expect(readInstallDismissed(store)).toBe(false);
    writeInstallDismissed(store);
    expect(readInstallDismissed(store)).toBe(true);
    expect(Object.keys(store.data)).toEqual([INSTALL_DISMISSED_KEY]);
  });
  it("엉뚱한 값이 들어 있으면 false", () => {
    expect(readInstallDismissed(fakeStore({ [INSTALL_DISMISSED_KEY]: "{깨짐" }))).toBe(false);
  });
  it("저장소가 없거나 예외를 던져도 조용히 넘어간다", () => {
    expect(readInstallDismissed(null)).toBe(false);
    expect(readInstallDismissed(throwingStore())).toBe(false);
    expect(() => writeInstallDismissed(null)).not.toThrow();
    expect(() => writeInstallDismissed(throwingStore())).not.toThrow();
  });
});
