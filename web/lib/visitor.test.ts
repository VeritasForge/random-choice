import { describe, expect, it } from "vitest";
import {
  claimVisit,
  markStatsOwner,
  sendVisit,
  STATS_OWNER_KEY,
  VISIT_GAP_MS,
  VISIT_SENT_KEY,
  VISITOR_ID_KEY,
} from "./visitor";
import type { Store } from "./visits";

/** Map으로 만든 가짜 저장소. 실제 브라우저 저장소 없이 node에서 돈다. */
function fakeStore(initial: Record<string, string> = {}): Store & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** 쓰려 하면 던지는 저장소(용량 초과·저장 차단). */
function throwingOnSet(): Store {
  return {
    getItem: () => null,
    setItem() {
      throw new Error("quota");
    },
    removeItem() {},
  };
}

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const NOW = 1_700_000_000_000;

describe("claimVisit", () => {
  it("처음이면 ID를 만들어 local에 저장하고 돌려주며 session에 now를 적는다", () => {
    const local = fakeStore();
    const session = fakeStore();
    expect(claimVisit(local, session, NOW, () => ID_A)).toBe(ID_A);
    expect(local.map.get(VISITOR_ID_KEY)).toBe(ID_A);
    expect(session.map.get(VISIT_SENT_KEY)).toBe(String(NOW));
  });

  it("같은 탭에서 29분 뒤에는 null, 30분 뒤에는 같은 ID", () => {
    const local = fakeStore();
    const session = fakeStore();
    claimVisit(local, session, NOW, () => ID_A);
    expect(claimVisit(local, session, NOW + VISIT_GAP_MS - 60_000, () => ID_B)).toBeNull();
    expect(claimVisit(local, session, NOW + VISIT_GAP_MS, () => ID_B)).toBe(ID_A);
  });

  it("session만 새것이면(새 탭) 같은 ID를 다시 돌려주고 newId를 부르지 않는다", () => {
    const local = fakeStore({ [VISITOR_ID_KEY]: ID_A });
    let called = false;
    const id = claimVisit(local, fakeStore(), NOW, () => {
      called = true;
      return ID_B;
    });
    expect(id).toBe(ID_A);
    expect(called).toBe(false);
  });

  it("통계 주인 표시가 있으면 null이고 session에 아무것도 적지 않는다", () => {
    const local = fakeStore({ [STATS_OWNER_KEY]: "1" });
    const session = fakeStore();
    expect(claimVisit(local, session, NOW, () => ID_A)).toBeNull();
    expect(session.map.size).toBe(0);
  });

  it("local이나 session이 null이면 null", () => {
    expect(claimVisit(null, fakeStore(), NOW, () => ID_A)).toBeNull();
    expect(claimVisit(fakeStore(), null, NOW, () => ID_A)).toBeNull();
  });

  it("읽다가 던져도 null이고 예외가 밖으로 나오지 않는다", () => {
    const throwingGet: Store = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {},
      removeItem() {},
    };
    expect(claimVisit(throwingGet, fakeStore(), NOW, () => ID_A)).toBeNull();
  });

  it("쓰다가 던져도 null이고 예외가 밖으로 나오지 않는다", () => {
    expect(claimVisit(fakeStore(), throwingOnSet(), NOW, () => ID_A)).toBeNull();
  });

  it("local의 ID가 망가져 있으면 새로 만든다", () => {
    const local = fakeStore({ [VISITOR_ID_KEY]: "abc" });
    expect(claimVisit(local, fakeStore(), NOW, () => ID_A)).toBe(ID_A);
    expect(local.map.get(VISITOR_ID_KEY)).toBe(ID_A);
  });

  it("session의 값이 숫자가 아니면 보낸 적 없는 것으로 본다", () => {
    const local = fakeStore({ [VISITOR_ID_KEY]: ID_A });
    expect(claimVisit(local, fakeStore({ [VISIT_SENT_KEY]: "NaN" }), NOW, () => ID_B)).toBe(ID_A);
  });

  it("session의 값이 미래 시각이면 보낸 적 없는 것으로 본다", () => {
    const local = fakeStore({ [VISITOR_ID_KEY]: ID_A });
    const session = fakeStore({ [VISIT_SENT_KEY]: String(NOW + 1000) });
    expect(claimVisit(local, session, NOW, () => ID_B)).toBe(ID_A);
  });
});

describe("sendVisit", () => {
  it("정해진 인자로 fetcher를 부른다", async () => {
    const calls: unknown[][] = [];
    const fetcher = (async (...args: unknown[]) => {
      calls.push(args);
      return new Response("{}");
    }) as typeof fetch;
    await sendVisit(ID_A, fetcher);
    expect(calls).toEqual([
      [
        "/api/v1/visits",
        {
          method: "POST",
          body: JSON.stringify({ visitorId: ID_A }),
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        },
      ],
    ]);
  });

  it("fetcher가 던져도 던지지 않는다", async () => {
    const fetcher = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    await expect(sendVisit(ID_A, fetcher)).resolves.toBeUndefined();
  });

  it("500을 돌려줘도 던지지 않는다", async () => {
    const fetcher = (async () => new Response("", { status: 500 })) as typeof fetch;
    await expect(sendVisit(ID_A, fetcher)).resolves.toBeUndefined();
  });
});

describe("markStatsOwner", () => {
  it("local에 표시를 남긴다", () => {
    const local = fakeStore();
    markStatsOwner(local);
    expect(local.map.get(STATS_OWNER_KEY)).toBe("1");
  });

  it("null이어도 던지지 않는다", () => {
    expect(() => markStatsOwner(null)).not.toThrow();
  });

  it("setItem이 던지는 저장소여도 던지지 않는다", () => {
    expect(() => markStatsOwner(throwingOnSet())).not.toThrow();
  });
});
