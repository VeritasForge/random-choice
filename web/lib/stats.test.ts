import { describe, expect, it } from "vitest";
import { axisMax, bucketLabel, fetchStats, parseUnit } from "./stats";
import { INTERNAL_KEY_HEADER } from "./proxy";

describe("parseUnit", () => {
  it("day·week·month만 받고 나머지는 day", () => {
    expect(parseUnit("week")).toBe("week");
    expect(parseUnit("month")).toBe("month");
    expect(parseUnit("day")).toBe("day");
    expect(parseUnit("year")).toBe("day");
    expect(parseUnit(undefined)).toBe("day");
    expect(parseUnit(["day", "week"])).toBe("day");
  });
});

describe("bucketLabel", () => {
  it("일은 월/일 (요일)", () => {
    expect(bucketLabel("2026-11-19", "day")).toBe("11/19 (목)");
  });
  it("주는 그 주 월요일 날짜에 '주'", () => {
    expect(bucketLabel("2026-11-16", "week")).toBe("11/16 주");
  });
  it("월은 연-월", () => {
    expect(bucketLabel("2026-11-01", "month")).toBe("2026-11");
  });
});

describe("axisMax", () => {
  it("비었거나 전부 0이면 1", () => {
    expect(axisMax([])).toBe(1);
    expect(axisMax([0, 0])).toBe(1);
  });
  it("가장 큰 값 이상인 1·2·5·10·20·50… 중 가장 작은 수", () => {
    expect(axisMax([3])).toBe(5);
    expect(axisMax([10])).toBe(10);
    expect(axisMax([11])).toBe(20);
    expect(axisMax([137])).toBe(200);
    expect(axisMax([1, 2])).toBe(2);
  });
});

describe("fetchStats", () => {
  const buckets = [
    { start: "2026-11-18", visitors: 3, visits: 4 },
    { start: "2026-11-19", visitors: 5, visits: 8 },
  ];

  it("성공하면 칸을 그대로 돌려주고 주소와 헤더를 맞게 보낸다", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const result = await fetchStats("week", "http://api.test", "k3y", async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ unit: "week", buckets }), { status: 200 });
    });
    expect(result).toEqual({ ok: true, buckets });
    expect(calls[0].url).toBe("http://api.test/api/v1/stats?unit=week");
    expect(new Headers(calls[0].init?.headers).get(INTERNAL_KEY_HEADER)).toBe("k3y");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("키가 비어 있으면 헤더를 붙이지 않는다", async () => {
    let init: RequestInit | undefined;
    await fetchStats("day", "http://api.test", "", async (_url, i) => {
      init = i;
      return new Response(JSON.stringify({ buckets: [] }), { status: 200 });
    });
    expect(new Headers(init?.headers).has(INTERNAL_KEY_HEADER)).toBe(false);
  });

  it("200이 아니면 그 상태 번호", async () => {
    const result = await fetchStats("day", "http://api.test", "", async () => new Response("{}", { status: 503 }));
    expect(result).toEqual({ ok: false, status: 503 });
  });

  it("fetcher가 던지면 상태 0", async () => {
    const result = await fetchStats("day", "http://api.test", "", async () => {
      throw new Error("down");
    });
    expect(result).toEqual({ ok: false, status: 0 });
  });

  it("buckets가 배열이 아니면 상태 200으로 실패", async () => {
    const result = await fetchStats(
      "day",
      "http://api.test",
      "",
      async () => new Response(JSON.stringify({ buckets: "x" }), { status: 200 }),
    );
    expect(result).toEqual({ ok: false, status: 200 });
  });

  it("칸의 숫자가 숫자가 아니면 상태 200으로 실패", async () => {
    const result = await fetchStats(
      "day",
      "http://api.test",
      "",
      async () =>
        new Response(JSON.stringify({ buckets: [{ start: "2026-11-19", visitors: "5", visits: 8 }] }), { status: 200 }),
    );
    expect(result).toEqual({ ok: false, status: 200 });
  });

  it("본문이 JSON이 아니어도 던지지 않고 상태 200으로 실패", async () => {
    const result = await fetchStats("day", "http://api.test", "", async () => new Response("<html>", { status: 200 }));
    expect(result).toEqual({ ok: false, status: 200 });
  });
});
