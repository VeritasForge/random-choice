import { useEffect, useRef } from "react";
import { SHEET_SANDBOX } from "@/lib/sheet";

/** 창에 띄울 가게. url은 kakaoPlaceUrl(web/lib/visits.ts)을 통과한 https 주소여야 한다. */
export type SheetPlace = { name: string; url: string };

/** 방문 기록에 넣는 우리 칸의 표시. */
const SHEET_STATE_KEY = "placeSheet";

function isSheetEntry(): boolean {
  const state: unknown = history.state;
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[SHEET_STATE_KEY] === true
  );
}

type Props = {
  /** 띄울 가게. null이면 창이 닫혀 있다. */
  place: SheetPlace | null;
  onClose: () => void;
};

/**
 * 결과 화면 위에 뜨는 창. 카카오 가게 페이지를 iframe으로 보여 준다.
 *
 * 있는 이유: 가게 페이지를 새 탭으로 열면 평점을 보고 마음에 들지 않을 때마다 탭을 닫고
 * 돌아와야 한다. 이 창은 목록을 그대로 둔 채 그 위에서 열렸다 닫힌다.
 *
 * 브라우저 기본 dialog를 showModal()로 여는 이유: Esc로 닫기, 창 밖으로 포커스가 새지
 * 않게 가두기, 닫은 뒤 눌렀던 자리로 포커스 돌려놓기를 브라우저가 해 준다.
 *
 * `카카오에서 열기`를 항상 두는 이유: 카카오가 서버 설정을 바꿔 다른 사이트 안에 표시되는
 * 것을 막으면 이 창은 빈 화면이 된다. 주소가 다른 사이트의 iframe은 안을 들여다볼 수 없어
 * 막혔는지를 알아낼 믿을 만한 방법이 없으므로, 감지하지 않고 새 탭으로 가는 길을 늘 둔다.
 */
export default function PlaceSheet({ place, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (place === null) {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    // 창을 여는 것을 방문 기록 한 칸으로 만든다. 이 앱은 방문 기록을 달리 쓰지 않아서,
    // 이것이 없으면 창이 열린 채 휴대폰의 뒤로 가기를 했을 때 사이트를 떠나고 메모리에만
    // 있는 결과가 사라진다. 새 탭으로 열던 때에는 뒤로 가기가 그 탭만 닫았다.
    // 이미 우리 칸이 맨 위면 다시 넣지 않는다(개발 모드는 effect를 두 번 돌린다).
    if (!isSheetEntry()) {
      history.pushState({ [SHEET_STATE_KEY]: true }, "");
    }
    // 뒤로 가기로 우리 칸이 빠지면 창을 닫는다.
    const onPopState = () => dialog.close();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [place]);

  // 닫히는 길이 몇 갈래든(닫기·Esc·바깥 누름·뒤로 가기) 여기 한 곳을 지난다.
  function handleClose() {
    // 뒤로 가기로 닫힌 것이 아니면 우리 칸이 아직 맨 위에 남아 있다. 빼 주지 않으면 다음
    // 뒤로 가기가 아무 일도 하지 않는 헛걸음이 된다. 뒤로 가기로 닫힌 경우에는 칸이 이미
    // 빠져 있어 이 조건에 걸리지 않으므로, 두 경우를 따로 기억해 둘 필요가 없다.
    //
    // 알려진 한계: 창 안에서 카카오 페이지의 탭(메뉴·후기 등)을 눌렀다면 그 이동도 같은
    // 방문 기록에 쌓여서, 아래의 한 걸음은 그중 하나만 되돌리고 우리 칸은 남는다. 그때는
    // 나중의 뒤로 가기가 한 번 헛돈다(2026-11-19 크롬 계열에서 확인: 헛도는 것은 한 번뿐이고
    // 결과 화면은 그대로다). 몇 걸음을 되돌려야 하는지 믿을 만하게 셀 방법이 없고, 넘치게
    // 되돌리면 사이트를 떠나 결과를 잃으므로 한 걸음만 되돌린다.
    if (isSheetEntry()) {
      history.back();
    }
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={place === null ? undefined : `${place.name} 카카오 가게 페이지`}
      // Esc와 close() 모두 이 이벤트를 낸다. 닫히는 길이 몇 갈래든 상태는 여기서만 비운다.
      onClose={handleClose}
      // 창 바깥 어두운 영역은 dialog 자신이 받는다(::backdrop은 따로 누를 수 없다).
      // dialog에는 안쪽 여백이 없고 내용 전체를 아래 div가 덮으므로, 누른 것이 dialog
      // 자신이면 바깥을 누른 것이다.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      {place !== null ? (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-line p-2 pl-4">
            <span className="min-w-0 grow truncate text-lg font-semibold">{place.name}</span>
            <a
              href={place.url}
              target="_blank"
              rel="noreferrer noopener"
              className="btn btn-quiet btn-sm shrink-0"
            >
              카카오에서 열기
            </a>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn btn-quiet btn-sm shrink-0"
            >
              닫기
            </button>
          </div>
          {/* 닫히면 iframe이 사라져 카카오 페이지 로딩도 멈춘다. */}
          <iframe
            src={place.url}
            title={`${place.name} 카카오 가게 페이지`}
            sandbox={SHEET_SANDBOX}
            className="sheet-frame"
          />
        </div>
      ) : null}
    </dialog>
  );
}
