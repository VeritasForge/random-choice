import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { errorNotice, KNOWN_ERROR_CODES } from "./errors";

describe("errorNotice", () => {
  it("아는 코드면 다음에 할 일까지 알려 준다", () => {
    // 서버 문구를 그대로 쓰면 제목과 거의 같은 문장이 두 번 나오고
    // "내일 다시 이용해 주세요"라는 안내가 사라진다. 그것을 막는 시험이다.
    const notice = errorNotice("quota_exceeded", "오늘 조회 한도를 다 썼습니다.");
    expect(notice.title).toBe("오늘 조회 한도를 다 썼어요");
    expect(notice.description).toBe("내일 다시 이용해 주세요.");
  });

  it("모르는 코드면 서버가 준 문구를 설명으로 쓴다", () => {
    const notice = errorNotice("something_new", "서버가 새로 만든 오류입니다.");
    expect(notice.title).toBe("문제가 생겼어요");
    expect(notice.description).toBe("서버가 새로 만든 오류입니다.");
  });

  it("모르는 코드인데 서버 문구도 없으면 기본 안내를 쓴다", () => {
    expect(errorNotice("something_new", "").description).toBe("잠시 후 다시 시도해 주세요.");
    expect(errorNotice("something_new").description).toBe("잠시 후 다시 시도해 주세요.");
    expect(errorNotice("something_new", "   ").description).toBe(
      "잠시 후 다시 시도해 주세요.",
    );
  });

  it("모든 안내에 제목과 설명이 채워져 있다", () => {
    for (const code of KNOWN_ERROR_CODES) {
      const notice = errorNotice(code);
      expect(notice.title.length, `${code}의 제목`).toBeGreaterThan(0);
      expect(notice.description.length, `${code}의 설명`).toBeGreaterThan(0);
    }
  });
});

describe("서버가 보내는 오류 코드", () => {
  it("서버가 낼 수 있는 코드에 빠짐없이 안내 문구가 있다", () => {
    // 화면과 서버는 오류 코드 어휘를 함께 쓰지만 어느 쪽도 상대를 검사하지 않는다.
    // 그래서 서버 소스에서 코드를 직접 뽑아 대조한다 — 서버에 코드를 추가하고
    // 여기 문구를 빠뜨리면 이 시험이 실패한다.
    const handlerPath = fileURLToPath(
      new URL("../../api/internal/httpapi/handler.go", import.meta.url),
    );
    const source = readFileSync(handlerPath, "utf8");
    // writeError로 보내는 코드와, 미리 만들어 둔 본문 문자열에 박힌 코드를 함께 모은다.
    const codes = [
      ...[...source.matchAll(/writeError\(\s*w,\s*[^,]+,\s*"([a-z_]+)"/g)].map((m) => m[1]),
      ...[...source.matchAll(/"error":"([a-z_]+)"/g)].map((m) => m[1]),
    ];

    expect(codes.length, "서버 소스에서 오류 코드를 하나도 찾지 못했다").toBeGreaterThan(0);
    for (const code of new Set(codes)) {
      expect(KNOWN_ERROR_CODES, `서버 코드 ${code}의 안내 문구가 없다`).toContain(code);
    }
  });
});
