import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  CUISINE_LABELS,
  cuisineLabel,
  parseShare,
  placeNumber,
  sendShare,
  sharePath,
  shareText,
  shareTitle,
} from "./share";

describe("종류 이름표", () => {
  it("아는 식별자는 이름을 준다", () => {
    expect(cuisineLabel("donkatsu")).toBe("돈까스·우동");
  });

  it("모르는 값과 글자가 아닌 값은 null이다", () => {
    for (const v of ["", "nope", undefined, null, 3, ["donkatsu"]]) {
      expect(cuisineLabel(v)).toBeNull();
    }
  });

  it("객체의 기본 속성 이름은 종류가 아니다", () => {
    // 이름표를 그냥 객체로 두고 표[값]으로 읽으면 이 값들에서 함수가 나온다.
    for (const v of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(cuisineLabel(v)).toBeNull();
    }
  });

  it("Go 서버의 종류 표와 짝이 정확히 같다", () => {
    // 화면과 서버는 종류 어휘를 함께 쓰지만 어느 쪽도 상대를 검사하지 않는다.
    // 그래서 서버 소스에서 짝을 직접 뽑아 대조한다(errors.test.ts와 같은 수법).
    const path = fileURLToPath(new URL("../../api/internal/cuisine/cuisine.go", import.meta.url));
    const source = readFileSync(path, "utf8");
    const fromGo = new Map(
      [...source.matchAll(/Cuisine\{"([a-z]+)",\s*"([^"]+)"\}/g)].map((m) => [m[1], m[2]]),
    );
    expect(
      fromGo.size,
      "Go 소스에서 찾은 종류가 줄었다. 종류가 사라졌거나 대조 방법이 더 이상 통하지 않는다",
    ).toBeGreaterThanOrEqual(18);
    expect(new Map(CUISINE_LABELS)).toEqual(fromGo);
  });
});

describe("가게 주소에서 장소 번호를 얻는다", () => {
  it("http와 https, 뒤에 붙은 물음표를 가리지 않는다", () => {
    expect(placeNumber("http://place.map.kakao.com/12345678")).toBe("12345678");
    expect(placeNumber("https://place.map.kakao.com/12345678?service=x#y")).toBe("12345678");
  });

  it("다른 꼴의 주소, 빈 값, 다른 사이트는 null이다", () => {
    for (const v of [
      "",
      "https://place.map.kakao.com/",
      "https://place.map.kakao.com/m/123",
      "https://place.map.kakao.com/12a",
      "https://evil.example/123",
      `https://place.map.kakao.com/${"1".repeat(21)}`,
      undefined,
    ]) {
      expect(placeNumber(v)).toBeNull();
    }
  });
});

describe("링크 만들기와 읽기", () => {
  it("만든 경로를 다시 읽으면 같은 값이 나온다", () => {
    expect(sharePath("12345678", "donkatsu")).toBe("/s/12345678?c=donkatsu");
    expect(parseShare("12345678", "donkatsu")).toEqual({
      placeNo: "12345678",
      placeUrl: "https://place.map.kakao.com/12345678",
      cuisineId: "donkatsu",
      cuisineLabel: "돈까스·우동",
    });
  });

  it("숫자가 아닌 장소 번호는 받지 않는다", () => {
    for (const v of ["", "abc", "12a", "１２３", "-1", "1.5", " 1", "1".repeat(21)]) {
      expect(parseShare(v, "donkatsu")).toBeNull();
    }
    expect(parseShare("1".repeat(20), "donkatsu")).not.toBeNull();
  });

  it("표에 없는 종류와 종류가 없는 경우는 종류 없이 연다", () => {
    for (const c of ["nope", "", undefined, "constructor"]) {
      expect(parseShare("123", c)).toEqual({
        placeNo: "123",
        placeUrl: "https://place.map.kakao.com/123",
        cuisineId: null,
        cuisineLabel: null,
      });
    }
  });

  it("종류가 여러 번 오면 모르는 것으로 본다", () => {
    expect(parseShare("123", ["bunsik", "gogi"])?.cuisineId).toBeNull();
  });
});

describe("글", () => {
  it("보내는 글은 종류, 가게 이름 순이다", () => {
    expect(shareText("돈까스·우동", "연돈")).toBe("오늘은 돈까스·우동, 연돈 어때요?");
  });

  it("제목은 종류를 알 때와 모를 때가 다르다", () => {
    expect(shareTitle("돈까스·우동")).toBe("오늘은 돈까스·우동");
    expect(shareTitle(null)).toBe("오늘 점심, 여기 어때요?");
  });
});

describe("보내기", () => {
  const text = "오늘은 분식, 가게 어때요?";
  const url = "https://a.example/s/1?c=bunsik";
  // 브라우저는 사용자가 공유 창을 닫으면 이름이 AbortError인 오류로 알린다.
  const abort = () => Object.assign(new Error("닫음"), { name: "AbortError" });

  it("공유 창이 있으면 글과 주소를 넘긴다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();
    expect(await sendShare(text, url, { share, copy })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text, url });
    expect(copy).not.toHaveBeenCalled();
  });

  it("닫으면 아무것도 하지 않는다", async () => {
    const copy = vi.fn();
    const share = () => Promise.reject(abort());
    expect(await sendShare(text, url, { share, copy })).toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });

  it("공유가 거절되면 복사한다", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const share = () => Promise.reject(new Error("NotAllowed"));
    expect(await sendShare(text, url, { share, copy })).toBe("copied");
    expect(copy).toHaveBeenCalledWith(`${text}\n${url}`);
  });

  it("공유 창이 없으면 글과 주소를 한 줄씩 복사한다", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    expect(await sendShare(text, url, { copy })).toBe("copied");
    expect(copy).toHaveBeenCalledWith(`${text}\n${url}`);
  });

  it("복사도 안 되면 failed다", async () => {
    const copy = () => Promise.reject(new Error("x"));
    expect(await sendShare(text, url, { copy })).toBe("failed");
    expect(await sendShare(text, url, {})).toBe("failed");
  });
});
