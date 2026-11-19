/** 누름 이벤트에서 판정에 쓰는 값만 추린 모양. 시험이 DOM 없이 돌 수 있게 한다. */
export type ClickLike = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * 가게 창을 열어도 되는 누름인지. 보조 키 없는 왼쪽 누름만 그렇다.
 *
 * 나머지(가운데 버튼, Cmd·Ctrl·Shift·Alt를 누른 채 누름)는 사용자가 새 탭이나 새 창을
 * 직접 고른 것이므로 가로채지 않고 브라우저에 맡긴다.
 */
export function isPlainClick(event: ClickLike): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * 가게 창의 iframe에 거는 제한.
 *
 * **allow-top-navigation 계열을 넣지 말 것.** 넣으면 창 안의 카카오 페이지(`앱 열기` 같은
 * 버튼)가 이 서비스 화면 전체를 다른 주소로 보낼 수 있다. 뽑은 결과는 메모리에만 있어서
 * 그렇게 떠나면 전부 사라진다.
 *
 * 2026-11-19에 이 값으로 카카오 가게 페이지가 정상 표시되는 것을 크롬 계열 브라우저에서
 * 확인했다. allow-popups-to-escape-sandbox는 창 안의 링크가 새 탭으로 열릴 때 그 탭까지
 * 이 제한에 묶이지 않게 한다.
 */
export const SHEET_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms";
