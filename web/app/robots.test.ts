import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("/api/만 막고 사이트맵 주소를 알린다", () => {
    vi.stubEnv("SITE_URL", "https://a.example/");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://a.example/sitemap.xml",
    });
  });
  it("운영자용 화면의 주소를 적지 않는다", () => {
    expect(JSON.stringify(robots())).not.toContain("stats");
  });
});
