import { describe, expect, it } from "vitest";
import { isPlainClick, SHEET_SANDBOX } from "./sheet";

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

describe("가게 창을 여는 누름", () => {
  it("보조 키 없는 왼쪽 누름만 창을 연다", () => {
    expect(isPlainClick(plain)).toBe(true);
  });

  it.each([
    ["가운데 버튼", { ...plain, button: 1 }],
    ["Cmd", { ...plain, metaKey: true }],
    ["Ctrl", { ...plain, ctrlKey: true }],
    ["Shift", { ...plain, shiftKey: true }],
    ["Alt", { ...plain, altKey: true }],
  ])("%s 누름은 브라우저에 맡긴다", (_name, event) => {
    expect(isPlainClick(event)).toBe(false);
  });
});

describe("가게 창의 iframe 제한", () => {
  const tokens = SHEET_SANDBOX.split(" ");

  it("카카오 페이지가 동작하는 데 필요한 것을 허용한다", () => {
    expect(tokens).toEqual(
      expect.arrayContaining(["allow-scripts", "allow-same-origin", "allow-popups"]),
    );
  });

  it("창 안의 페이지가 이 서비스 화면 전체를 다른 곳으로 보내지 못한다", () => {
    expect(tokens.filter((t) => t.startsWith("allow-top-navigation"))).toEqual([]);
  });
});
