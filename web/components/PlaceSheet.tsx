import { useEffect, useRef } from "react";
import { SHEET_SANDBOX } from "@/lib/sheet";

/** 창에 띄울 가게. url은 kakaoPlaceUrl(web/lib/visits.ts)을 통과한 https 주소여야 한다. */
export type SheetPlace = { name: string; url: string };

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
    if (place !== null && !dialog.open) {
      dialog.showModal();
    } else if (place === null && dialog.open) {
      dialog.close();
    }
  }, [place]);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label={place === null ? undefined : `${place.name} 카카오 가게 페이지`}
      // Esc와 close() 모두 이 이벤트를 낸다. 닫히는 길이 몇 갈래든 상태는 여기서만 비운다.
      onClose={onClose}
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
