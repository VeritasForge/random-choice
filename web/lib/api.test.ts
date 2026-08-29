import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
      // 이름이 빈 종류는 글자 없는 후보 버튼이 된다.
      { cuisines: [{ name: "", count: 1 }], places: [] },
      // id는 있는데 cuisine이 없는 가게 — 결과 화면 필터에 걸리지 않아 빈 목록이 된다.
      { cuisines: [{ name: "한식", count: 1 }], places: [{ id: "1", name: "가게" }] },
      // 화면이 그대로 그리는 이름·거리가 빠진 가게
      { cuisines: [{ name: "한식", count: 1 }], places: [{ id: "1", cuisine: "한식" }] },
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
    // 화면 상한이 서버 상한보다 짧으면, 서버가 정상으로 답할 요청까지 우리가 먼저 포기한다.
    // 서버 값을 손으로 베끼면 그쪽을 올렸을 때 이 시험이 조용히 통과하므로,
    // Go 소스에서 직접 뽑아 비교한다(errors.test.ts가 오류 코드에 쓰는 방식과 같다).
    const source = readFileSync(
      fileURLToPath(new URL("../../api/internal/kakao/client.go", import.meta.url)),
      "utf8",
    );
    const match = source.match(/DefaultSearchTimeout = (\d+) \* time\.Second/);
    expect(
      match,
      "서버 조회 상한을 client.go에서 찾지 못했다 — 대조 방법이 더 이상 통하지 않는다",
    ).not.toBeNull();
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(Number(match![1]) * 1000);
  });

  it("오류 응답에서도 본문이 멈추면 timeout으로 던진다", () => {
    // 200 경로와 짝이 되는 시험이다. 이 갈래가 없으면 프록시가 502 헤더만 보내고
    // 본문을 끝내지 않는 흔한 상황에서 "문제가 생겼어요"만 뜨고,
    // 사용자는 기다리다 실패했다는 사실도 안내받지 못한다.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"error":'));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
          },
        });
        return new Response(stream, {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    vi.useFakeTimers();
    const pending = fetchNearby(37.5, 127.0, 500);
    const assertion = expect(pending).rejects.toMatchObject({
      code: "timeout",
      status: 502,
    });
    return vi
      .advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      .then(() => assertion)
      .finally(() => vi.useRealTimers());
  });
});

describe("응답 원소 검사 — 항목 하나씩", () => {
  // 여러 항목을 한꺼번에 뺀 자료로만 시험하면, 먼저 걸리는 검사 하나가 나머지를 가린다.
  // 실제로 검사를 하나만 지워도 다른 시험이 전부 통과한다. 그래서 온전한 가게 한 건을
  // 기준으로 두고 항목을 하나씩만 어긋뜨린다.
  const GOOD_PLACE = {
    id: "1",
    name: "김밥집",
    cuisine: "분식",
    distance: 100,
    roadAddress: "서울 강남구 테헤란로 1",
    phone: "02-000-0000",
    placeUrl: "http://place.map.kakao.com/1",
    lat: 37.5,
    lng: 127.0,
  };
  const GOOD_CUISINES = [{ name: "분식", count: 1 }];

  const cases: Record<string, Record<string, unknown>> = {
    "이름이 없다": { name: undefined },
    "도로명 주소가 없다": { roadAddress: undefined },
    "장소 주소가 없다": { placeUrl: undefined },
    "거리가 없다": { distance: undefined },
    "거리가 숫자가 아니다": { distance: "100" },
    "종류가 빈 문자열이다": { cuisine: "" },
    "식별자가 숫자다": { id: 1 },
  };

  const cuisineCases: Record<string, Record<string, unknown>> = {
    "종류에 개수가 없다": { count: undefined },
    "종류의 개수가 숫자가 아니다": { count: "1" },
  };

  for (const [label, patch] of Object.entries(cuisineCases)) {
    it(`${label} — malformed_response`, async () => {
      respondWith(200, {
        cuisines: [{ ...GOOD_CUISINES[0], ...patch }],
        places: [GOOD_PLACE],
      });
      await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
        code: "malformed_response",
      });
    });
  }

  for (const [label, patch] of Object.entries(cases)) {
    it(`가게에 ${label} — malformed_response`, async () => {
      respondWith(200, {
        cuisines: GOOD_CUISINES,
        places: [{ ...GOOD_PLACE, ...patch }],
      });
      await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
        code: "malformed_response",
      });
    });
  }

  it("거리가 무한대여도 거른다", async () => {
    // JSON.stringify는 Infinity를 null로 바꾸므로 원문 응답으로 보낸다.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            '{"cuisines":[{"name":"분식","count":1}],"places":[{"id":"1","name":"김밥집","cuisine":"분식","distance":1e999,"roadAddress":"주소","phone":"","placeUrl":"http://x","lat":37.5,"lng":127.0}]}',
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    await expect(fetchNearby(37.5, 127.0, 500)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });

  it("온전한 응답은 그대로 통과시킨다", async () => {
    // 위 검사들이 정상 응답까지 막지 않는지 확인하는 대조군이다.
    const payload = { cuisines: GOOD_CUISINES, places: [GOOD_PLACE] };
    respondWith(200, payload);
    await expect(fetchNearby(37.5, 127.0, 500)).resolves.toEqual(payload);
  });

  it("도로명 주소와 장소 주소는 비어 있어도 통과시킨다", async () => {
    // 서버가 실제로 보내는 값이다. 길이까지 요구하면 정상 응답을 튕겨 낸다.
    const payload = {
      cuisines: GOOD_CUISINES,
      places: [{ ...GOOD_PLACE, roadAddress: "", placeUrl: "", id: "", distance: 0 }],
    };
    respondWith(200, payload);
    await expect(fetchNearby(37.5, 127.0, 500)).resolves.toEqual(payload);
  });
});
