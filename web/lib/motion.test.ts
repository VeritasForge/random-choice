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
 */
describe("움직임 접근성", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  /** globals.css가 선언한 @keyframes 이름 전부. */
  const keyframeNames = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);

  /** prefers-reduced-motion: reduce 블록이 시작하는 자리부터 파일 끝까지. */
  const reduceBlock = (() => {
    const at = css.search(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
    return at < 0 ? null : css.slice(at);
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
