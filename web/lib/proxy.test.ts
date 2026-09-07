import { describe, expect, it } from "vitest";
import {
  INTERNAL_KEY_HEADER,
  proxyNearby,
  UNREACHABLE_ERROR_CODE,
  type Fetcher,
} from "./proxy";

/**
 * 가짜 호출자. 받은 주소와 요청 설정을 기록하고, 미리 정해 둔 응답을 돌려준다.
 * 실제 통신을 하지 않으므로 Go 서버도 네트워크도 필요 없다.
 */
function fakeFetcher(response: Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  return { fetcher, calls };
}

/** 요청에 실제로 실린 헤더를 읽는다. Headers로 감싸야 대소문자에 걸리지 않는다. */
function sentHeaders(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

const ORIGIN = "http://go-server.example";
const SEARCH = "?lat=37.5&lng=127.0&radius=800";

describe("proxyNearby", () => {
  it("비밀값을 헤더에 실어 보낸다", async () => {
    // 이 헤더가 빠지면 Go 서버가 401로 막는다. 화면 전체가 조회 불가가 되는 자리다.
    const { fetcher, calls } = fakeFetcher(new Response("{}", { status: 200 }));
    await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", fetcher);

    expect(calls).toHaveLength(1);
    expect(sentHeaders(calls[0].init).get(INTERNAL_KEY_HEADER)).toBe("k3y-abc123");
  });

  it("비밀값이 비어 있으면 헤더를 아예 붙이지 않는다", async () => {
    // 로컬 개발 경로다. 빈 값을 그대로 보내면 Go 서버는 그것을 틀린 값으로 보고 막는다.
    const { fetcher, calls } = fakeFetcher(new Response("{}", { status: 200 }));
    await proxyNearby(SEARCH, ORIGIN, "", fetcher);

    expect(sentHeaders(calls[0].init).has(INTERNAL_KEY_HEADER)).toBe(false);
  });

  it("질의 문자열을 손대지 않고 그대로 넘긴다", async () => {
    // 좌표나 반경이 한 글자라도 달라지면 엉뚱한 동네를 조회한다. 오류는 나지 않는다.
    const { fetcher, calls } = fakeFetcher(new Response("{}", { status: 200 }));
    await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", fetcher);

    expect(calls[0].url).toBe(`${ORIGIN}/api/v1/nearby${SEARCH}`);
  });

  it("성공 응답의 상태 코드와 본문을 그대로 넘긴다", async () => {
    const payload = `{"cuisines":[{"id":"bunsik","label":"분식","count":1}],"places":[]}`;
    const { fetcher } = fakeFetcher(
      new Response(payload, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
    const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", fetcher);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(payload);
  });

  it("오류 응답의 상태 코드와 본문도 그대로 넘긴다", async () => {
    // 화면의 errors.ts는 서버가 준 코드로 안내 문구를 고른다. 중계가 오류를 삼키거나
    // 상태 코드를 200으로 바꾸면, 사용자는 무엇이 잘못됐는지 알 방법이 없어진다.
    const payload = `{"error":"quota_exceeded","message":"오늘 조회 한도를 다 썼습니다."}`;
    const { fetcher } = fakeFetcher(
      new Response(payload, {
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
    const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", fetcher);

    expect(response.status).toBe(429);
    expect(await response.text()).toBe(payload);
  });

  it("Go 서버가 붙인 Cache-Control: no-store를 지운 채로 넘기지 않는다", async () => {
    // 카카오가 결과 저장을 금지한다(설계 문서 9절). 중계가 이 헤더를 떨어뜨리면
    // Vercel이나 중간 캐시가 응답을 담을 수 있다.
    const { fetcher } = fakeFetcher(
      new Response("{}", { status: 200, headers: { "Cache-Control": "no-store" } }),
    );
    const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", fetcher);

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("위쪽 응답에 Cache-Control이 없어도 no-store를 붙여 내보낸다", async () => {
    // Go 서버가 아니라 중간의 무언가(프록시·게이트웨이)가 답한 경우다.
    // 그때 캐시 금지가 사라지면, 저장하지 않겠다는 약속이 가장 위험한 순간에만 빠진다.
    const { fetcher } = fakeFetcher(new Response("서버에 닿지 못했습니다", { status: 502 }));
    const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", fetcher);

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  describe("조회 서버에 닿지 못했을 때", () => {
    // 목적지가 없거나(주소가 틀렸거나 서버가 멎었다) 비밀값에 ASCII 밖의 글자가 있으면
    // fetch가 던진다. 그대로 나가면 본문 없는 500이 되고, 화면은 코드를 못 읽어
    // "문제가 생겼어요"와 눌러도 낫지 않는 다시 시도 버튼을 그린다.
    const throwing: Fetcher = async () => {
      throw new TypeError("fetch failed");
    };

    it("우리 잘못이 아니라 위쪽에 못 닿은 것이므로 502로 답한다", async () => {
      const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", throwing);
      expect(response.status).toBe(502);
    });

    it("본문이 이 저장소의 오류 형식이라 화면이 안내 문구를 고를 수 있다", async () => {
      const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", throwing);
      const body = await response.json();

      expect(body.error).toBe(UNREACHABLE_ERROR_CODE);
      expect(typeof body.message).toBe("string");
      expect(body.message.length).toBeGreaterThan(0);
    });

    it("이때도 Cache-Control: no-store를 붙인다", async () => {
      const response = await proxyNearby(SEARCH, ORIGIN, "k3y-abc123", throwing);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });
});
