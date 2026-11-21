import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap.xml", () => {
  it("시작 화면 하나만 알린다", () => {
    vi.stubEnv("SITE_URL", "https://a.example/");
    expect(sitemap()).toEqual([{ url: "https://a.example/" }]);
  });
});
