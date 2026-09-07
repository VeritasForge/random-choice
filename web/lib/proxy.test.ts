import { describe, expect, it } from "vitest";
import { INTERNAL_KEY_HEADER, proxyNearby, type Fetcher } from "./proxy";

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
});
