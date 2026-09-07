import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 화면에서 자리를 옮기는 움직임에는 반드시 prefers-reduced-motion 짝이 있어야 한다.
 *
 * 왜 지켜야 하나: 전정기관 장애가 있으면 화면의 움직임이 어지럼증·메스꺼움을 유발한다.
 * 이 서비스는 서서 걸으며 쓰는 것을 전제하므로 특히 중요하다.
 *
 * **이 그물이 잡지 못하는 것 — 정직하게 적어 둔다.**
 * 시험은 브라우저 없이 도는 Node 환경에서 돈다. 미디어 질의를 실제로 평가할 수 없으므로
 * app/globals.css의 **글자를 대조하는 것**이 할 수 있는 전부다. 따라서
 *
 * - 인라인 style이나 JavaScript(Web Animations API, requestAnimationFrame 등)로 넣은
 *   움직임은 이 파일에 아무 흔적도 남기지 않고 그대로 빠져나간다.
 * - 다른 CSS 파일이나 라이브러리가 들여온 애니메이션도 보지 못한다.
 * - transition으로 위치를 옮기는 것(예: transform을 transition으로 미는 것)도 보지 못한다.
 *   지금 이 앱의 transition은 색과 불투명도뿐이라 전정기관을 건드리지 않지만,
 *   나중에 누가 transform을 넣어도 이 시험은 초록불을 준다.
 *
 * 즉 이 시험은 "CSS 클래스로 넣은 @keyframes 애니메이션"이라는 **한 경로**만 지킨다.
 * 완전한 방어로 착각하지 말 것.
 *
 * **끄는 방법은 `animation: none` 하나만 인정한다.** 널리 쓰이는
 * `animation-duration: 0.01ms` 기법으로 꺼 두면 이 시험은 "안 껐다"고 실패한다.
 * 안전한 쪽으로 틀리는 오경보라 논리를 넓히지 않았다. 이 저장소는 animation: none으로
 * 통일하고, 그 기법을 쓰기로 하면 이 시험도 함께 고친다.
 *
 * **검사 범위는 reduce 블록 안까지다.** 예전에는 reduce가 처음 나온 자리부터 파일
 * 끝까지를 검사 대상으로 삼아서, 블록 안에서 끄지 않고 그 아래 다른 블록(예: @media
 * print)에서 껐어도 초록불이 떴다. 지금은 중괄호 짝을 세어 블록 안만 잘라낸다.
 */
describe("움직임 접근성", () => {
  // 주석을 먼저 걷어낸다. 아래 중괄호 세기와 규칙 대조가 모두 글자 대조라,
  // 주석 안의 중괄호나 예시 코드가 그대로 섞이면 엉뚱한 자리를 블록으로 잡는다.
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  /** globals.css가 선언한 @keyframes 이름 전부. */
  const keyframeNames = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);

  /**
   * prefers-reduced-motion: reduce 블록의 여는 중괄호부터 짝이 맞는 닫는 중괄호까지.
   * 파일 끝까지 자르면 그 아래 어느 블록에서 껐어도 통과해 방어가 사라진다.
   */
  const reduceBlock = (() => {
    const at = css.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    if (at < 0) {
      return null;
    }
    const open = css.indexOf("{", at);
    if (open < 0) {
      return null;
    }
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") {
        depth += 1;
      } else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          return css.slice(open, i + 1);
        }
      }
    }
    // 닫히지 않은 블록. 파일 끝까지를 블록으로 쳐 주면 안 된다 — 그것이 바로
    // 여기서 없애려는 구멍이다.
    return null;
  })();

  it("애니메이션을 선언한 곳이 있다", () => {
    // 이 시험이 없으면, 애니메이션을 전부 지운 파일에서도 아래 시험이
    // "검사할 것이 없다"는 이유로 조용히 통과한다.
    expect(keyframeNames.length).toBeGreaterThan(0);
  });

  it("prefers-reduced-motion: reduce 블록이 있다", () => {
    expect(reduceBlock).not.toBeNull();
  });

  it("선언한 모든 애니메이션이 reduce 블록에서 꺼진다", () => {
    for (const name of keyframeNames) {
      // 그 이름을 animation에 쓰는 클래스를 찾는다.
      const users = [
        ...css.matchAll(new RegExp(`\\.([\\w-]+)\\s*\\{[^}]*animation:\\s*${name}\\b`, "g")),
      ].map((match) => match[1]);

      // 아무도 쓰지 않는 @keyframes는 죽은 선언이다. 그것을 통과로 세면
      // "쓰이지 않아서 검사할 것도 없다"가 초록불이 되어 그물에 구멍이 난다.
      expect(users, `@keyframes ${name}을(를) 쓰는 클래스가 없다`).not.toHaveLength(0);

      for (const cls of users) {
        // reduceBlock이 null이면 ""로 바꿔 넘긴다. 그냥 넘기면 vitest가
        // "toMatch는 문자열을 받는다"는 타입 오류로 죽어, 정작 무엇이 잘못됐는지
        // (reduce 블록에서 꺼지지 않는다) 메시지에 남지 않는다.
        expect(
          reduceBlock ?? "",
          `.${cls}이(가) reduce 블록에서 animation: none을 받지 않는다`,
        ).toMatch(new RegExp(`\\.${cls}\\s*\\{[^}]*animation:\\s*none`));
      }
    }
  });
});
