import { describe, expect, it } from "vitest";
import { checkBasicAuth, STATS_CHALLENGE } from "./statsAuth";

/** "이름:비밀번호"를 Basic 헤더 값으로 만든다. 한글도 UTF-8로 인코딩한다. */
function basic(credentials: string): string {
  return "Basic " + Buffer.from(credentials, "utf8").toString("base64");
}

describe("checkBasicAuth", () => {
  it("맞는 비밀번호면 true", () => {
    expect(checkBasicAuth(basic("me:test1234"), "test1234")).toBe(true);
  });

  it("사용자 이름은 보지 않는다", () => {
    expect(checkBasicAuth(basic("누구든:test1234"), "test1234")).toBe(true);
    expect(checkBasicAuth(basic(":test1234"), "test1234")).toBe(true);
  });

  it("틀린 비밀번호면 false", () => {
    expect(checkBasicAuth(basic("me:wrong"), "test1234")).toBe(false);
  });

  it("길이만 다른 접두 비밀번호도 false", () => {
    expect(checkBasicAuth(basic("me:test12345"), "test1234")).toBe(false);
    expect(checkBasicAuth(basic("me:test123"), "test1234")).toBe(false);
  });

  it("헤더가 없거나 Basic이 아니면 false", () => {
    expect(checkBasicAuth(null, "test1234")).toBe(false);
    expect(checkBasicAuth("Bearer x", "test1234")).toBe(false);
  });

  it("base64가 아니거나 콜론이 없으면 false", () => {
    expect(checkBasicAuth("Basic !!!", "test1234")).toBe(false);
    expect(checkBasicAuth(basic("test1234"), "test1234")).toBe(false);
  });

  it("서버 비밀번호가 비어 있으면 아무도 못 들어온다", () => {
    expect(checkBasicAuth(basic("any:"), "")).toBe(false);
    expect(checkBasicAuth(basic("any:anything"), "")).toBe(false);
  });

  it("비밀번호에 콜론이 있어도 첫 콜론 뒤를 통째로 비교한다", () => {
    expect(checkBasicAuth(basic("a:b:c"), "b:c")).toBe(true);
  });

  it("한글 비밀번호도 된다", () => {
    expect(checkBasicAuth(basic("me:비밀번호1"), "비밀번호1")).toBe(true);
  });

  it("도전 헤더는 realm과 UTF-8을 알린다", () => {
    expect(STATS_CHALLENGE).toBe('Basic realm="stats", charset="UTF-8"');
  });
});
