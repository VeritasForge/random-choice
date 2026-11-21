import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION, SITE_NAME, siteMetadata, siteUrl } from "./site";

describe("정식 주소", () => {
  it("SITE_URL을 그대로 쓴다", () => {
    expect(siteUrl({ SITE_URL: "https://a.example" })).toBe("https://a.example");
  });
  it("끝의 /와 앞뒤 빈칸을 뗀다", () => {
    expect(siteUrl({ SITE_URL: " https://a.example/ " })).toBe("https://a.example");
  });
  it("없거나 빈칸뿐이면 개발용 주소다", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ SITE_URL: "  " })).toBe("http://localhost:3000");
  });
  it("https://를 빼먹으면 이름을 밝힌 오류를 낸다", () => {
    expect(() => siteUrl({ SITE_URL: "a.example" })).toThrow(/SITE_URL/);
  });
});

describe("head 정보", () => {
  const m = siteMetadata({ SITE_URL: "https://a.example" });
  it("제목과 설명은 그대로다", () => {
    expect(m.title).toBe(SITE_NAME);
    expect(m.description).toBe(SITE_DESCRIPTION);
  });
  it("주소의 기준과 대표 주소를 알린다", () => {
    expect(String(m.metadataBase)).toBe("https://a.example/");
    expect(m.alternates).toEqual({ canonical: "/" });
  });
  it("링크 미리보기 정보를 알린다", () => {
    expect(m.openGraph).toEqual({
      type: "website",
      url: "/",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      locale: "ko_KR",
    });
    expect(m.twitter).toEqual({ card: "summary_large_image" });
  });
  it("소유 확인 코드가 없으면 확인 항목 자체가 없다", () => {
    expect(m.verification).toBeUndefined();
    expect(
      siteMetadata({ GOOGLE_SITE_VERIFICATION: "", NAVER_SITE_VERIFICATION: " " }).verification,
    ).toBeUndefined();
  });
  it("있는 쪽 확인 코드만 낸다", () => {
    expect(siteMetadata({ GOOGLE_SITE_VERIFICATION: "g1" }).verification).toEqual({ google: "g1" });
    expect(siteMetadata({ NAVER_SITE_VERIFICATION: "n1" }).verification).toEqual({
      other: { "naver-site-verification": "n1" },
    });
  });
});
