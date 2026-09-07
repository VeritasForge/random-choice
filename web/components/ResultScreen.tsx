import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/api";
import { distanceLabel } from "@/lib/reasons";

type Props = {
  cuisine: string;
  places: Place[];
  total: number;
  /** 회피가 무엇을 했는지 알리는 한 줄. null이면 줄 자체를 그리지 않는다(web/lib/reasons.ts). */
  notice: string | null;
  /**
   * 회피가 켜져 있는지.
   *
   * 꺼졌다는 사실을 이 화면이 말해야 하는 이유: 회피가 켜져 있을 때는 "무엇을 했는지
   * 알리고 되돌릴 수 있게 한다"를 지키면서 꺼져 있을 때는 안 지키면, 사용자는 자기가
   * 만든 상태를 모르는 채로 남는다. 껐다는 것을 알 길도, 결과 화면에서 되돌릴 길도
   * 없어지기 때문이다.
   */
  avoidOn: boolean;
  /** 뺀 가게를 다시 넣을 수 있는지. 판정 규칙은 web/lib/reasons.ts의 canRestore가 갖는다. */
  canRestore: boolean;
  /** 회피를 켜고 끈다. "다시 넣기"와 "다시 켜기"가 같은 것을 부른다 — 방향만 반대다. */
  onToggleAvoid: () => void;
  onDecide: (place: Place) => void;
  /** 이미 기록해 둔 장소 ID. 여기 있는 가게에는 버튼 대신 "정하신 곳"을 그린다. */
  decidedIds: readonly string[];
  onReshuffle: () => void;
  onRestart: () => void;
};

/**
 * 이 수 이하로 찾은 종류는 뽑을 것이 남지 않아 "다른 가게 보기" 버튼이 아예 붙지 않고,
 * 처음부터 다시 해서 같은 종류를 골라도 언제나 같은 목록이 나온다.
 * 몇 곳을 찾았는지 밝히지 않으면 사용자는 그 반복을 고장으로 받아들인다 — 실제로 그런 제보가 있었다.
 *
 * 2026-09-06 실측에서 홍대입구역 부근 가장 가까운 45곳의 음식 종류가 열한 가지였고,
 * 그중 여섯 가지가 이 상태였다(샐러드는 한 곳뿐이었다).
 */
const FEW = 2;

const ROW_CLASS =
  "row flex items-center justify-between gap-3 rounded-xl border border-line p-3";

/**
 * 상호·거리·주소를 담은 줄. 상호만 링크로 만드는 이유: 옆에 "여기로 정했어요" 버튼이
 * 서는데, 버튼을 링크 안에 넣으면 HTML이 허락하지 않는 중첩이 되어 키보드·낭독기가
 * 둘 중 하나를 제대로 집지 못한다. 그래서 줄 전체가 아니라 상호만 링크다.
 *
 * 다만 상호 글자만으로는 걸으면서 누르기에 너무 작다. 그래서 링크에 row-link를 붙여
 * 보이지 않는 겹침 층을 줄 전체에 깐다 — 마크업의 중첩은 그대로 없고 판정 영역만
 * 줄 전체로 넓어진다(app/globals.css에 까닭을 적어 두었다).
 *
 * 거리와 주소를 한 줄에 붙인 이유: 따로 두면 줄이 세 줄이 되어 네 곳을 보여 주는 데
 * 휴대폰 한 화면을 다 쓴다. 거리를 앞에 두는 것은 점심에 먼저 보는 값이 그것이라서다.
 *
 * **곁글(거리·주소)도 16px이다.** 한때 14px로 내려 두고 "16px면 결과 네 줄이 한 화면에
 * 안 들어간다"고 적었는데, 2026-09-07에 390×844 브라우저로 직접 재 보니 사실이 아니었다.
 * 잰 값(줄 높이는 링크 있는 줄 80px, 링크 없는 줄 128px):
 *
 * - 보통 결과 화면(안내 상자 없음): 필요 644px / 844px — 여유 200px, 스크롤 없음
 * - 가장 빡빡한 조합(두 줄짜리 안내 상자 + "다른 가게 보기" + 링크 없는 줄 하나):
 *   필요 858px — 14px 넘쳐 그만큼 스크롤이 생긴다(같은 조합이 14px일 때는 808px였다)
 *
 * 그 한 조합 때문에 화면 전체를 14px로 내리지는 않았다. 설계가 정한 글자 하한이 16px이고
 * (서서 보는 화면이다), 바깥 상자가 쓰는 min-h-dvh는 주소 표시줄을 뺀 높이라 실제
 * 기기에서 쓸 수 있는 높이는 844px보다 낮다 — 14px로 내려도 808px이 들어간다는 보장이 없다.
 */
function PlaceRow({ place }: { place: Place }) {
  // 주소가 비어 올 수 있다. 그대로 이으면 "240m · 도보 4분 · "처럼 꼬리가 남는다.
  const meta = [distanceLabel(place.distance), place.roadAddress].filter(Boolean).join(" · ");
  const hasLink = Boolean(place.placeUrl);

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {/*
        카카오가 place_url을 비워 보내는 경우가 있다(시험 자료에도 그 경우가 있다).
        빈 문자열을 href에 넣으면 브라우저가 "현재 문서"로 해석한다. 새 탭에서
        열리므로 지금 보고 있는 결과를 잃지는 않지만, 이 앱이 처음부터 다시
        열릴 뿐이라 사용자에게는 고장으로 보인다. 주소가 없으면 링크가 아니라
        그냥 글자로 그린다.
      */}
      {hasLink ? (
        <a
          href={place.placeUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="row-link truncate text-lg font-semibold underline-offset-4 hover:underline"
        >
          {place.name}
        </a>
      ) : (
        <span className="truncate text-lg font-semibold">{place.name}</span>
      )}
      {/*
        tabular-nums: 24m·49m·80m처럼 숫자가 세로로 늘어서므로 자리폭을 고정해 눈금처럼 읽히게 한다.

        링크가 없을 때만 truncate를 걷어내는 이유: 거리와 주소를 한 줄로 이어 붙이면
        주소는 사실상 언제나 잘린다. 링크가 있는 줄은 잘려도 카카오 페이지에서 정확한
        주소를 다시 볼 수 있지만, 카카오가 place_url을 비워 보내는 줄에는 되찾을 길이
        아예 없다 — 화면에 남은 잘린 글자가 전부다. 걸으면서 가게를 찾는 사람에게
        주소는 유일한 길 정보라, 그 줄만 접혀서라도 다 보이게 한다.
        링크 없는 줄이 한 줄 더 커지는 것은 받아들인다.
      */}
      <span
        className={
          hasLink
            ? "truncate text-base text-muted tabular-nums"
            : "text-base text-muted tabular-nums"
        }
      >
        {meta}
      </span>
    </span>
  );
}

function DecideControl({
  place,
  decided,
  markRef,
  onDecide,
}: {
  place: Place;
  decided: boolean;
  /** 방금 정한 가게일 때만 붙는다. 이 자리로 포커스를 옮기기 위한 것이다. */
  markRef?: React.Ref<HTMLSpanElement>;
  onDecide: (place: Place) => void;
}) {
  // 장소 ID가 빈 가게에는 아무것도 그리지 않는다. 조회기는 ID가 빈 가게를 일부러
  // 살려 두는데(api/internal/kakao/client.go) recordVisit은 빈 ID를 저장하지 않으므로,
  // 버튼을 두면 눌러도 아무 일이 없다. 없는 편이 죽은 버튼보다 낫다.
  if (place.id === "") {
    return null;
  }
  if (decided) {
    // tabIndex={-1}은 Tab 순서에 넣기 위한 것이 아니라(누를 것이 없으므로 넣으면 안 된다)
    // 아래 useEffect가 여기로 포커스를 옮길 수 있게 하기 위한 것이다.
    //
    // row-action이 붙는 이유는 버튼과 같다. 이 글자가 겹침 층 아래로 들어가면
    // 포커스가 옮겨 온 자리를 눌렀을 때 엉뚱하게 가게 페이지가 열린다.
    return (
      <span
        ref={markRef}
        tabIndex={-1}
        className="row-action shrink-0 text-base font-semibold text-muted"
      >
        정하신 곳
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onDecide(place)}
      className="btn btn-accent-quiet btn-sm row-action shrink-0"
    >
      여기로 정했어요
    </button>
  );
}

export default function ResultScreen({
  cuisine,
  places,
  total,
  notice,
  avoidOn,
  canRestore,
  onToggleAvoid,
  onDecide,
  decidedIds,
  onReshuffle,
  onRestart,
}: Props) {
  // 방금 "여기로 정했어요"를 누른 가게. 그 자리의 버튼이 "정하신 곳" 글자로 바뀌면서
  // 사라지므로, 포커스를 새 글자로 옮겨 주지 않으면 포커스가 body로 떨어진다.
  // 그러면 키보드 사용자의 다음 Tab이 문서 맨 처음부터 다시 시작하고,
  // 화면 낭독기는 아무 말도 하지 않는다 — 이 화면의 통지 영역은 목록의 이름들을
  // 읽는 것이라 기록해도 내용이 바뀌지 않기 때문이다.
  // 포커스를 옮기면 낭독기가 새 초점인 "정하신 곳"을 읽어 주어 둘이 한 번에 닫힌다.
  const [justDecidedId, setJustDecidedId] = useState<string | null>(null);
  const markRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (justDecidedId === null) {
      return;
    }
    // 기록이 막힌 경우(저장소 차단 등)에는 버튼이 그대로 남아 markRef가 비어 있다.
    // 그때는 포커스가 원래 버튼에 그대로 있으므로 아무것도 하지 않는 것이 맞다.
    markRef.current?.focus();
  }, [justDecidedId]);

  function decide(place: Place) {
    onDecide(place);
    setJustDecidedId(place.id);
  }

  // 맨 위에 그릴 안내. 둘은 겹치지 않는다 — 회피가 꺼져 있으면 뺀 것이 없어
  // notice가 반드시 null이기 때문이다(web/lib/avoid.ts).
  let banner: { text: string; actionLabel: string | null } | null = null;
  if (notice !== null) {
    banner = { text: notice, actionLabel: canRestore ? "다시 넣기" : null };
  } else if (!avoidOn) {
    banner = { text: "최근에 정한 곳 빼기가 꺼져 있어요", actionLabel: "다시 켜기" };
  }

  return (
    // grow·my-auto로 버튼 묶음을 화면 아래쪽에 붙인다(까닭은 StartScreen에 적어 두었다).
    <section className="rise flex w-full grow flex-col">
      <div className="my-auto flex w-full flex-col items-center gap-5 py-6">
        {/*
          회피가 한 일을 맨 위에서 밝힌다. 조용히 거르면 사용자에게 통제권이 없는 것과
          같기 때문이다. 회피를 껐을 때도 같은 자리에서 밝힌다 — 켜졌을 때만 알리고
          껐을 때는 침묵하면, 사용자가 자기가 만든 상태를 모르는 채로 남는다.
          둘 다 아니면(회피가 켜져 있고 뺀 것도 없으면) 줄 자체를 그리지 않는다.
          기록이 빈 사람에게는 이 화면이 예전 그대로여야 한다.

          바탕색(bg-surface)만으로는 이 상자가 화면 바탕과 밝은 화면 1.11:1,
          어두운 화면 1.12:1로만 구분된다. 경계선 색을 #e5e1db에서 올린 근거가
          "햇빛 아래에서 안 보인다"였는데, 같은 잣대를 대면 테두리 없는 이 상자야말로
          밖에서 경계가 사라진다. 그래서 border-line을 준다 —
          밝은 화면 3.44:1, 어두운 화면 3.48:1이라 WCAG 1.4.11의 3:1을 넘는다.
        */}
        {banner !== null ? (
          <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-surface p-3 text-center">
            <p className="text-base leading-relaxed text-muted">{banner.text}</p>
            {banner.actionLabel !== null ? (
              <button
                type="button"
                onClick={onToggleAvoid}
                className="btn btn-quiet btn-sm"
              >
                {banner.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-base text-muted">오늘은</p>
          {/*
            결과는 단정적으로, 크게 한 덩어리로 보여 준다 — "묻지 않고 내놓는다"가
            화면에서 드러나는 자리다. 설계가 정한 하한은 2.5rem이고 여기서는 3rem을 썼다.
            화면에서 강조색을 쓰는 곳은 이 이름과 주요 버튼뿐이다.
          */}
          <h2 className="text-5xl leading-tight font-bold tracking-tight text-balance break-keep text-accent">
            {cuisine}
          </h2>
          {total <= FEW ? (
            <p className="text-base text-muted">가까운 곳 중에서는 {total}곳을 찾았어요</p>
          ) : null}
        </div>

        <ul className="flex w-full flex-col gap-2">
          {/*
            key에 순번을 섞는 이유: 조회기는 식별자가 빈 가게를 일부러 살려 둔다
            (api/internal/kakao/client.go). 그런 가게가 같은 종류에 둘 이상이면
            key가 빈 문자열로 겹쳐, React가 목록을 다시 그릴 때 엉뚱한 항목을 재사용한다.
          */}
          {places.map((place, index) => (
            <li key={place.id || `unknown-${index}`} className={ROW_CLASS}>
              <PlaceRow place={place} />
              <DecideControl
                place={place}
                decided={decidedIds.includes(place.id)}
                markRef={place.id === justDecidedId ? markRef : undefined}
                onDecide={decide}
              />
            </li>
          ))}
        </ul>

        {/*
          눈에는 보이지 않고 화면 낭독기만 읽는 영역. 후보 화면과 같은 까닭이다 —
          "다른 가게 보기"는 화면 이름을 바꾸지 않아 포커스가 움직이지 않으므로,
          이것이 없으면 낭독기 사용자는 버튼을 누르고도 목록이 바뀌었는지 알 수 없다.
          "다시 넣기"도 같은 화면 안에서 목록만 바꾸므로 여기에 기댄다.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {places.map((place) => place.name).join(", ")}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {/*
          보여주지 못하고 남은 가게가 있을 때만 버튼을 둔다. 걸러진 것을 이미 전부
          보여주고 있는데 버튼을 두면, 눌러도 같은 목록이 그대로 남아
          이 화면이 고쳐 놓은 바로 그 인상을 다시 준다.
        */}
        {places.length < total ? (
          <button type="button" onClick={onReshuffle} className="btn btn-quiet w-full">
            다른 가게 보기
          </button>
        ) : null}
        <button type="button" onClick={onRestart} className="btn btn-quiet w-full">
          처음부터 다시
        </button>
      </div>
    </section>
  );
}
