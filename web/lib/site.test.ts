import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION, SITE_NAME, shareMetadata, siteMetadata, siteUrl } from "./site";

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
  it("포트만 붙이고 https://를 빼먹어도 같은 오류를 낸다", () => {
    expect(() => siteUrl({ SITE_URL: "localhost:3000" })).toThrow(/SITE_URL/);
    expect(() => siteUrl({ SITE_URL: "my.domain:443" })).toThrow(/SITE_URL/);
  });
  it("웹 주소가 아닌 것은 받지 않는다", () => {
    expect(() => siteUrl({ SITE_URL: "ftp://x" })).toThrow(/SITE_URL/);
    expect(() => siteUrl({ SITE_URL: "mailto:a@b.c" })).toThrow(/SITE_URL/);
  });
  it("주소 뒤에 붙은 경로·물음표 뒤는 떼고, 대소문자와 기본 포트를 정리한다", () => {
    expect(siteUrl({ SITE_URL: "https://a.example/?x=1" })).toBe("https://a.example");
    expect(siteUrl({ SITE_URL: "HTTPS://A.Example:443/app/" })).toBe("https://a.example");
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

describe("공유 화면의 머리 정보", () => {
  const meta = shareMetadata("오늘은 돈까스·우동", "/s/123?c=donkatsu");
  it("제목은 받은 글자 그대로이고 서비스 이름을 붙이지 않는다", () => {
    expect(meta.title).toBe("오늘은 돈까스·우동");
    expect(meta.openGraph?.title).toBe("오늘은 돈까스·우동");
  });
  it("대표 주소와 미리보기 주소는 이 화면의 주소다", () => {
    expect(meta.alternates?.canonical).toBe("/s/123?c=donkatsu");
    expect(meta.openGraph?.url).toBe("/s/123?c=donkatsu");
  });
  it("서비스 이름과 설명은 사이트 공통 값을 쓴다", () => {
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: SITE_NAME,
      description: SITE_DESCRIPTION,
      locale: "ko_KR",
    });
    expect(meta.description).toBe(SITE_DESCRIPTION);
  });
  it("검색엔진 수집에서 뺀다", () => {
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
  it("미리보기 그림은 사이트 공통 그림이고, 설명 글은 그림 옆의 글 파일과 같다", () => {
    // openGraph를 직접 내면 app/opengraph-image.png가 저절로 붙지 않는다(빌드 결과로 확인).
    // 설명 글을 두 곳에 적게 되므로 어긋나지 않는지 여기서 본다.
    const alt = readFileSync(
      fileURLToPath(new URL("../app/opengraph-image.alt.txt", import.meta.url)),
      "utf8",
    ).trim();
    expect(meta.openGraph?.images).toEqual([
      { url: "/opengraph-image.png", width: 1200, height: 630, alt },
    ]);
  });
});
