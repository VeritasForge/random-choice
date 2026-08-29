import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { errorNotice, KNOWN_ERROR_CODES } from "./errors";

describe("errorNotice", () => {
  it("아는 코드면 다음에 할 일까지 알려 준다", () => {
    // 서버 문구("장소 정보를 가져오지 못했습니다.")를 그대로 쓰면 제목과 같은 말이
    // 두 번 나오고 "잠시 후 다시 시도해 주세요"라는 안내가 자리를 잃는다.
    const notice = errorNotice("upstream_error", "장소 정보를 가져오지 못했습니다.");
    expect(notice.title).toBe("장소 정보를 가져오지 못했어요");
    expect(notice.description).toBe("잠시 후 다시 시도해 주세요.");
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
      expect(typeof notice.retryable, `${code}의 retryable`).toBe("boolean");
    }
  });

  it("다시 시도해도 소용없는 오류는 재시도를 권하지 않는다", () => {
    // 이 표시가 뒤집히면 화면은 "다시 시도해도 같은 결과가 나옵니다"라고 말하면서
    // 다시 시도 버튼만 보여 주는 막다른 길이 된다.
    for (const code of ["not_configured", "invalid_key", "quota_exceeded", "invalid_radius"]) {
      expect(errorNotice(code).retryable, `${code}는 재시도가 소용없다`).toBe(false);
    }
    for (const code of ["upstream_error", "network_error", "timeout", "position_unavailable"]) {
      expect(errorNotice(code).retryable, `${code}는 재시도할 만하다`).toBe(true);
    }
  });
});

describe("서버가 보내는 오류 코드", () => {
  /**
   * 지금 서버 소스에서 찾아지는 오류 코드 수. 아래 대조가 눈이 머는 것을 막는 하한이다.
   *
   * 필요한 이유: 대조는 정규식으로 소스를 훑으므로, 코드를 상수로 빼는 흔한 정리 한 번에
   * 하나도 못 찾는 상태가 될 수 있다. 그때 "찾은 것이 전부 표에 있다"는 검사는
   * 빈 목록에 대해 조용히 통과한다. 이 하한이 그 순간 실패해서, 대조 방법 자체를
   * 고쳐야 한다는 것을 알려 준다.
   * 서버에 코드를 새로 더했다면 이 숫자도 함께 올린다.
   */
  const EXPECTED_SERVER_CODE_COUNT = 7;

  it("서버가 낼 수 있는 코드에 빠짐없이 안내 문구가 있다", () => {
    // 화면과 서버는 오류 코드 어휘를 함께 쓰지만 어느 쪽도 상대를 검사하지 않는다.
    // 그래서 서버 소스에서 코드를 직접 뽑아 대조한다.
    const handlerPath = fileURLToPath(
      new URL("../../api/internal/httpapi/handler.go", import.meta.url),
    );
    const source = readFileSync(handlerPath, "utf8");
    // writeError로 보내는 코드와, 미리 만들어 둔 본문 문자열에 박힌 코드를 함께 모은다.
    const codes = new Set([
      ...[...source.matchAll(/writeError\(\s*w,\s*[^,]+,\s*"([a-z_]+)"/g)].map((m) => m[1]),
      ...[...source.matchAll(/"error"\s*:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    ]);

    expect(
      codes.size,
      "서버 소스에서 찾은 오류 코드가 줄었다. 코드가 사라졌거나 대조 방법이 더 이상 통하지 않는다",
    ).toBeGreaterThanOrEqual(EXPECTED_SERVER_CODE_COUNT);
    for (const code of codes) {
      expect(KNOWN_ERROR_CODES, `서버 코드 ${code}의 안내 문구가 없다`).toContain(code);
    }
  });
});
