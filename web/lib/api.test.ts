import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNearby, NearbyError, REQUEST_TIMEOUT_MS } from "./api";

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
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/nearby?lat=37.5&lng=127&radius=800",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("서버가 오류를 주면 코드를 담아 던진다", async () => {
    respondWith(429, { error: "quota_exceeded", message: "오늘 조회 한도를 다 썼습니다." });
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "quota_exceeded",
      message: "오늘 조회 한도를 다 썼습니다.",
      status: 429,
    });
  });

  it("오류 본문을 해석할 수 없으면 기본 코드·문구와 상태 코드를 담아 던진다", async () => {
    // 상태 코드를 버리면 "프록시가 못 닿았다"와 "서버가 500을 냈다"를 구분할 수 없다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("서버 오류", { status: 502 })),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "unknown_error",
      message: "알 수 없는 오류가 발생했습니다.",
      status: 502,
    });
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

  it("200인데 모양이 다르면 malformed_response로 던진다", async () => {
    // 검사 없이 통과시키면 계약 위반이 여기서 멈추지 않고, 한참 뒤 화면이 그 값을
    // 쓰는 자리에서 TypeError로 터진다. 그러면 원인과 증상이 떨어져 진단이 어려워진다.
    for (const body of [
      {},
      { cuisines: [] },
      { places: [] },
      { cuisines: {}, places: [] },
      [],
      // 원소까지 보지 않으면 아래 두 가지가 통과한다. 그러면 화면은 오류 없이
      // 글자 없는 후보 버튼을 그리고, 눌러도 아무 가게가 없는 화면으로 끝난다.
      { cuisines: ["한식"], places: [] },
      { cuisines: [{ name: "한식", count: 1 }], places: [{ name: "가게" }] },
    ]) {
      respondWith(200, body);
      await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
        code: "malformed_response",
      });
    }
  });

  it("본문이 null이어도 malformed_response로 던진다", async () => {
    respondWith(200, null);
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toBeInstanceOf(NearbyError);
  });

  it("응답이 오지 않으면 timeout으로 던진다", async () => {
    // 취소 수단이 없으면 화면은 "주변을 살펴보는 중…"에 갇힌다.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    vi.useFakeTimers();
    try {
      const pending = fetchNearby(37.5, 127.0, 500);
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
  it("헤더는 왔는데 본문이 멈춰도 timeout으로 던진다", async () => {
    // 상한을 fetch에만 걸면 헤더가 도착하는 순간 풀린다. 그러면 본문 스트림이
    // 멈췄을 때 response.json()이 영영 끝나지 않고, 화면은 "주변을 살펴보는 중…"에
    // 갇힌 채 버튼도 눌리지 않아 새로고침 말고는 빠져나갈 길이 없다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        const stream = new ReadableStream({
          start(controller) {
            // 헤더와 함께 본문 앞부분만 오고 그대로 멈춘 상황
            controller.enqueue(new TextEncoder().encode('{"cuisines":'));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    vi.useFakeTimers();
    try {
      const pending = fetchNearby(37.5, 127.0, 500);
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("성공하면 상한 타이머를 남기지 않는다", async () => {
    // 타이머를 정리하지 않으면 요청이 끝난 뒤에도 상한이 살아 있다.
    vi.useFakeTimers();
    try {
      respondWith(200, { cuisines: [], places: [] });
      await fetchNearby(37.5, 127.0, 500);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("상한이 서버 쪽 조회 상한보다 넉넉하다", () => {
    // 서버는 카카오 조회 전체를 12초에서 끊는다(api/internal/kakao/client.go).
    // 화면 상한이 그보다 짧으면 서버가 정상으로 답할 요청까지 우리가 먼저 포기한다.
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(12_000);
  });
});
