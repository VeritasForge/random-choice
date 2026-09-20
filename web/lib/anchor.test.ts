import { describe, expect, it } from "vitest";
import {
  anchorLabel, forgetKeyword, KEYWORD_KEY, readKeyword, writeKeyword, type Anchor,
} from "./anchor";
import type { Store } from "./visits";

function fakeStore(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

function throwingStore(): Store {
  return {
    getItem: () => { throw new DOMException("거부", "SecurityError"); },
    setItem: () => { throw new DOMException("초과", "QuotaExceededError"); },
    removeItem: () => { throw new DOMException("거부", "SecurityError"); },
  };
}

describe("검색어 저장", () => {
  it("저장한 글자를 그대로 읽는다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    expect(readKeyword(store)).toBe("경주");
  });

  it("저장된 것이 없으면 null이다", () => {
    expect(readKeyword(fakeStore())).toBeNull();
  });

  it("가장 마지막 것 하나만 남는다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    writeKeyword(store, "강남역");
    expect(readKeyword(store)).toBe("강남역");
  });

  it("앞뒤 공백을 떼고 저장한다", () => {
    const store = fakeStore();
    writeKeyword(store, "  경주  ");
    expect(readKeyword(store)).toBe("경주");
  });

  it("빈 글자는 저장하지 않는다", () => {
    const store = fakeStore();
    writeKeyword(store, "   ");
    expect(readKeyword(store)).toBeNull();
    expect(store.data[KEYWORD_KEY]).toBeUndefined();
  });

  it("지우면 없어진다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    forgetKeyword(store);
    expect(readKeyword(store)).toBeNull();
  });

  it("저장소가 null이어도 터지지 않는다", () => {
    expect(readKeyword(null)).toBeNull();
    expect(() => writeKeyword(null, "경주")).not.toThrow();
    expect(() => forgetKeyword(null)).not.toThrow();
  });

  it("저장소가 예외를 던져도 터지지 않는다", () => {
    const store = throwingStore();
    expect(readKeyword(store)).toBeNull();
    expect(() => writeKeyword(store, "경주")).not.toThrow();
    expect(() => forgetKeyword(store)).not.toThrow();
  });

  // 문자열이 아닌 값이 들어 있으면 없는 것으로 본다. 사람이 손으로 고쳤거나
  // 다른 판본이 남긴 값일 텐데, 그대로 화면에 그리면 단추 글자가 깨진다.
  it("문자열이 아닌 값은 없는 것으로 본다", () => {
    for (const bad of ['{"a":1}', "123", "true", "null", "[]", "깨진json{"]) {
      expect(readKeyword(fakeStore({ [KEYWORD_KEY]: bad }))).toBeNull();
    }
  });

  // **이 시험이 저장 경계를 지키는 유일한 방어다.** 카카오가 저장을 허용한 것은
  // 사용자가 직접 정한 장소의 장소식별값과 상호까지이고 좌표는 그 문구에 없다.
  // 나중에 "단추 한 번으로 바로 조회되게" 하려고 좌표를 얹고 싶어지면,
  // 타입 검사는 그것을 막지 못한다.
  it("저장된 값에 좌표도 장소 이름도 들어가지 않는다", () => {
    const store = fakeStore();
    writeKeyword(store, "경주");
    const raw = store.data[KEYWORD_KEY];
    expect(raw).toBe(JSON.stringify("경주"));
    expect(raw).not.toMatch(/lat|lng|\d+\.\d+/);
  });
});

describe("기준 위치 문구", () => {
  it("브라우저 위치일 때", () => {
    expect(anchorLabel({ kind: "here" })).toBe("지금 있는 곳");
  });

  it("옮긴 위치일 때는 장소 이름이 들어간다", () => {
    const anchor: Anchor = { kind: "spot", name: "경주 황리단길", lat: 35.83, lng: 129.21 };
    expect(anchorLabel(anchor)).toBe("경주 황리단길 주변");
  });

  // 긴 이름을 그대로 두면 좁은 화면에서 줄이 넘친다. 설계 문서 6절의
  // 미확인 전제 6번이 이것이었다. 잘라내는 길이는 한글 기준으로 정한다.
  it("아주 긴 이름은 줄여서 보여준다", () => {
    const anchor: Anchor = {
      kind: "spot", name: "해운대블루라인파크 청사포정거장", lat: 35.1, lng: 129.2,
    };
    const label = anchorLabel(anchor);
    expect(label.length).toBeLessThanOrEqual(20);
    expect(label).toContain("…");
    expect(label.endsWith("주변")).toBe(true);
  });
});
