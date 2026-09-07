import { describe, expect, it } from "vitest";
import { avoidNotice, canRestore, countLabel, distanceLabel, forgetNotice } from "./reasons";

describe("거리 문구", () => {
  it("미터와 도보 시간을 함께 보여 준다", () => {
    expect(distanceLabel(240)).toBe("240m · 도보 4분");
  });

  it("아주 가까우면 1분으로 올린다", () => {
    // 0분이라고 쓰면 무슨 뜻인지 알 수 없다.
    expect(distanceLabel(10)).toBe("10m · 도보 1분");
  });

  it("바로 옆이어도 0분이 아니라 1분이라고 말한다", () => {
    // 10m는 ceil(10/67)만으로도 이미 1분이 나와, "최소 1분" 하한을 지우고
    // 시험을 돌려도 통과한다 — 이 하한을 실제로 요구하는 값은 0m뿐이다.
    // ceil(0/67)은 0이므로, 하한이 없으면 "0m · 도보 0분"이 나온다.
    expect(distanceLabel(0)).toBe("0m · 도보 1분");
  });

  it("경계 안쪽은 아직 1분이다", () => {
    // 67m는 ceil(67/67)이 정확히 1분이다.
    //
    // 이 시험이 혼자 지키는 것은 **경계를 한 칸 미는 변이**다. 나누는 값을
    // (m + 1)/67로 바꾸면 67m만 2분이 되고 나머지 시험은 전부 통과한다.
    //
    // 분당 거리 자체를 바꾸는 변이는 여기가 아니라 다른 시험이 잡는다 —
    // 66으로 바꾸면 아래 867m 시험이(13분 → 14분), 70으로 바꾸면 바로 아래
    // 68m 시험이(2분 → 1분) 실패한다. 이 주석에 한때 "한쪽만 있으면 66이나
    // 70으로 바꿔도 통과한다"고 적혀 있었는데 산술로 재 보니 사실이 아니었다.
    expect(distanceLabel(67)).toBe("67m · 도보 1분");
  });

  it("올림한다 — 실제보다 짧게 말하지 않는다", () => {
    // 68m는 1.01분이다. 넉넉히 잡는 쪽이 사용자를 덜 실망시킨다.
    expect(distanceLabel(68)).toBe("68m · 도보 2분");
  });

  it("먼 곳도 정직하게 보여 준다", () => {
    // 실측에서 제주 애월의 가장 먼 가게가 867m였다. 감추지 않는다.
    expect(distanceLabel(867)).toBe("867m · 도보 13분");
  });
});

describe("곳 수 문구", () => {
  it("주변 몇 곳인지 알린다", () => {
    expect(countLabel(12)).toBe("주변 12곳");
  });
  it("한 곳뿐이어도 그대로 말한다", () => {
    expect(countLabel(1)).toBe("주변 1곳");
  });
});

describe("회피 안내", () => {
  // 항상 참인 문구는 붙이지 않는다. 기록이 빈 첫 사용자는 지금과 똑같은 화면을 본다.
  it("뺀 것이 없으면 안내를 만들지 않는다", () => {
    expect(avoidNotice(0, false)).toBeNull();
  });

  it("뺀 것이 있으면 몇 곳인지 말한다", () => {
    expect(avoidNotice(2, false)).toBe("지난번에 정하신 곳 2곳은 빼고 골랐어요");
  });

  it("전부 빠져서 풀었으면 그 사실을 말한다", () => {
    expect(avoidNotice(0, true)).toBe(
      "여기 있는 곳은 모두 최근에 정하신 곳이라 이번엔 그대로 보여 드려요",
    );
  });

  // avoid.ts는 지금 전부 빠지는 경우 removed를 항상 0으로 돌려주므로
  // (removed=3, released=true) 조합은 실제로는 나오지 않는다. 하지만 그건
  // avoid.ts 쪽의 관례일 뿐, avoidNotice 자신이 지켜야 할 규칙은 아니다.
  // avoid.ts가 나중에 "몇 곳이 있었는데 다 빠졌는지"까지 removed에 채워 넣도록
  // 바뀌어도, avoidNotice는 released를 먼저 봐야 한다 — released 분기를
  // removed 분기 뒤로 옮기면 이 시험이 "지난번에 정하신 곳 3곳은 빼고
  // 골랐어요"를 돌려받아 실패한다.
  it("released가 참이면 removed 값과 무관하게 released 문구를 돌려준다", () => {
    expect(avoidNotice(3, true)).toBe(
      "여기 있는 곳은 모두 최근에 정하신 곳이라 이번엔 그대로 보여 드려요",
    );
  });
});

describe("되돌리기 손잡이를 줄지", () => {
  it("뺀 것이 없으면 되돌릴 것도 없다", () => {
    expect(canRestore(0, false)).toBe(false);
  });

  it("뺀 것이 있으면 되돌릴 수 있다", () => {
    expect(canRestore(2, false)).toBe(true);
  });

  // 이번만 푼 회차는 이미 전부 보여 주고 있어서 되돌릴 것이 없다.
  it("이번만 푼 회차에는 손잡이를 주지 않는다", () => {
    expect(canRestore(0, true)).toBe(false);
  });

  // avoidNotice와 같은 까닭이다. avoid.ts가 지금 released 회차의 removed를 0으로
  // 돌려주는 것은 관례일 뿐이므로, 그 관례가 바뀌어도 이 판정이 흔들리면 안 된다.
  // released 분기를 removed 분기 뒤로 옮기면 이 시험이 true를 돌려받아 실패한다 —
  // 즉 누를 것이 없는 "다시 넣기" 버튼이 그려지기 시작한다.
  it("released가 참이면 removed 값과 무관하게 손잡이를 주지 않는다", () => {
    expect(canRestore(3, true)).toBe(false);
  });
});

describe("지운 뒤 안내", () => {
  // avoidNotice와 같은 까닭이다. 지운 것이 없는데 안내를 그리면 항상 참인 문구가 된다.
  it("지운 것이 없으면 안내를 만들지 않는다", () => {
    expect(forgetNotice(0)).toBeNull();
  });

  it("한 곳 지우면 그 수를 말한다", () => {
    expect(forgetNotice(1)).toBe("1곳을 지웠어요");
  });

  it("여러 곳 지우면 그 수를 말한다", () => {
    expect(forgetNotice(3)).toBe("3곳을 지웠어요");
  });

  // avoidNotice의 removed <= 0과 같은 까닭이다. 음수가 들어올 일은 없지만
  // 0 이하를 한 갈래로 보면 방어가 하나로 줄어든다.
  it("음수도 안내를 만들지 않는다", () => {
    expect(forgetNotice(-1)).toBeNull();
  });
});
