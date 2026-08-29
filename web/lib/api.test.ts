import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNearby, NearbyError } from "./api";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchNearby", () => {
  it("성공하면 결과를 그대로 돌려준다", async () => {
    const payload = {
      cuisines: [{ name: "분식", count: 2 }],
      places: [
        {
          id: "1",
          name: "김밥집",
          cuisine: "분식",
          distance: 100,
          roadAddress: "서울 강남구 테헤란로 1",
          phone: "02-000-0000",
          placeUrl: "http://place.map.kakao.com/1",
          lat: 37.5,
          lng: 127.0,
        },
      ],
    };
    respondWith(200, payload);
    await expect(fetchNearby(37.5, 127.0, 500)).resolves.toEqual(payload);
  });

  it("요청 주소에 위도·경도·반경을 담는다", async () => {
    respondWith(200, { cuisines: [], places: [] });
    await fetchNearby(37.5, 127.0, 800);
    expect(fetch).toHaveBeenCalledWith("/api/v1/nearby?lat=37.5&lng=127&radius=800");
  });

  it("서버가 오류를 주면 코드를 담아 던진다", async () => {
    respondWith(429, { error: "quota_exceeded", message: "오늘 조회 한도를 다 썼습니다." });
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "quota_exceeded",
      message: "오늘 조회 한도를 다 썼습니다.",
    });
  });

  it("오류 본문을 해석할 수 없어도 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("서버 오류", { status: 500 })),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toBeInstanceOf(NearbyError);
  });

  it("서버에 닿지 못하면 network_error로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("failed to fetch");
      }),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "network_error",
    });
  });

  it("200인데 본문이 JSON이 아니면 malformed_response로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 })),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
});
