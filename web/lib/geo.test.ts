import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentPosition, GeoError, POSITION_TIMEOUT_MS } from "./geo";

type Options = PositionOptions | undefined;

/**
 * 브라우저의 위치 기능을 흉내 낸다. 실제 위치 권한은 시험에서 쓸 수 없다.
 * 세 번째 인자(옵션)도 받아 둔다 — 그래야 시간 제한이 실제로 넘어가는지 확인할 수 있다.
 */
function stubGeolocation(
  impl: (ok: (position: unknown) => void, fail: (error: unknown) => void) => void,
): { lastOptions: () => Options } {
  let seen: Options;
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (
        ok: (position: unknown) => void,
        fail: (error: unknown) => void,
        options: Options,
      ) => {
        seen = options;
        impl(ok, fail);
      },
    },
  });
  return { lastOptions: () => seen };
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
    await expect(getCurrentPosition()).rejects.toMatchObject({
      code: "permission_denied",
    });
  });

  it("그 밖의 실패는 position_unavailable", async () => {
    stubGeolocation((_ok, fail) => fail({ code: 3, PERMISSION_DENIED: 1 }));
    await expect(getCurrentPosition()).rejects.toMatchObject({
      code: "position_unavailable",
    });
  });

  it("위치 기능이 없는 브라우저면 unsupported", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getCurrentPosition()).rejects.toMatchObject({ code: "unsupported" });
  });

  it("실패는 GeoError로 던진다", async () => {
    // 그냥 Error로 던지면 부르는 쪽이 message를 오류 코드로 오인하게 되고,
    // 그 흐름 안에서 생긴 무관한 예외까지 위치 실패로 뭉뚱그려진다.
    stubGeolocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }));
    await expect(getCurrentPosition()).rejects.toBeInstanceOf(GeoError);
  });

  it("브라우저에 유한한 시간 제한을 넘긴다", async () => {
    // 제한이 없으면 브라우저 기본값이 무한대라, 신호가 약한 곳에서 콜백이 영영 오지 않고
    // 화면은 "주변을 살펴보는 중…"에 갇힌다. 사용자에게는 빠져나올 버튼도 없다.
    const stub = stubGeolocation((ok) =>
      ok({ coords: { latitude: 37.5, longitude: 127.0 } }),
    );
    await getCurrentPosition();
    expect(stub.lastOptions()?.timeout).toBe(POSITION_TIMEOUT_MS);
    expect(Number.isFinite(stub.lastOptions()?.timeout)).toBe(true);
  });
});
