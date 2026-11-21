import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

/** PNG 머리(IHDR)에서 가로·세로를 읽는다. 16~23번째 바이트가 그 값이다. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(join(__dirname, "..", path));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("앱 정보 파일", () => {
  const m = manifest();
  it("이름을 줄이지 않는다", () => {
    expect(m.name).toBe("오늘은 뭐 먹지?");
    expect(m.short_name).toBe("오늘은 뭐 먹지?");
  });
  it("주소창 없이 시작 화면부터 연다", () => {
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("ko");
  });
  it("켜지는 동안의 바탕은 나무색이다", () => {
    expect(m.background_color).toBe("#e8d6b4");
    expect(m.theme_color).toBe("#e8d6b4");
  });
  it("아이콘 셋을 알린다", () => {
    expect(m.icons).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
  it("알린 크기와 실제 그림 파일의 크기가 같다", () => {
    expect(pngSize("public/icon-192.png")).toEqual([192, 192]);
    expect(pngSize("public/icon-512.png")).toEqual([512, 512]);
    expect(pngSize("public/icon-maskable-512.png")).toEqual([512, 512]);
    expect(pngSize("app/apple-icon.png")).toEqual([180, 180]);
  });
  it("링크 미리보기 그림은 가로 1200, 세로 630이다", () => {
    expect(pngSize("app/opengraph-image.png")).toEqual([1200, 630]);
  });
});
