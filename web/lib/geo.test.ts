import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentPosition } from "./geo";

/** 브라우저의 위치 기능을 흉내 낸다. 실제 위치 권한은 시험에서 쓸 수 없다. */
function stubGeolocation(
  impl: (ok: (position: unknown) => void, fail: (error: unknown) => void) => void,
) {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: impl } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCurrentPosition", () => {
  it("좌표를 받으면 위도·경도만 뽑아 돌려준다", async () => {
    stubGeolocation((ok) =>
      ok({ coords: { latitude: 37.5, longitude: 127.0, accuracy: 10 } }),
    );
    await expect(getCurrentPosition()).resolves.toEqual({ lat: 37.5, lng: 127.0 });
  });

  it("사용자가 거부하면 permission_denied", async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }));
    await expect(getCurrentPosition()).rejects.toThrow("permission_denied");
  });

  it("그 밖의 실패는 position_unavailable", async () => {
    stubGeolocation((_ok, fail) => fail({ code: 3, PERMISSION_DENIED: 1 }));
    await expect(getCurrentPosition()).rejects.toThrow("position_unavailable");
  });

  it("위치 기능이 없는 브라우저면 unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getCurrentPosition()).rejects.toThrow("unsupported");
  });
});
