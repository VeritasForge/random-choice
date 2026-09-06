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
  "flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800";
const BUTTON_CLASS =
  "rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
const SMALL_BUTTON_CLASS =
  "shrink-0 rounded-full border border-neutral-300 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

/**
 * 상호·주소·거리를 담은 줄. 상호만 링크로 만드는 이유: 옆에 "여기로 정했어요" 버튼이
 * 서는데, 버튼을 링크 안에 넣으면 HTML이 허락하지 않는 중첩이 되어 키보드·낭독기가
 * 둘 중 하나를 제대로 집지 못한다. 그래서 줄 전체가 아니라 상호만 링크다.
 */
function PlaceRow({ place }: { place: Place }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {/*
        카카오가 place_url을 비워 보내는 경우가 있다(시험 자료에도 그 경우가 있다).
        빈 문자열을 href에 넣으면 브라우저가 "현재 문서"로 해석한다. 새 탭에서
        열리므로 지금 보고 있는 결과를 잃지는 않지만, 이 앱이 처음부터 다시
        열릴 뿐이라 사용자에게는 고장으로 보인다. 주소가 없으면 링크가 아니라
        그냥 글자로 그린다.
      */}
      {place.placeUrl ? (
        <a
          href={place.placeUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate font-semibold underline-offset-4 transition hover:underline"
        >
          {place.name}
        </a>
      ) : (
        <span className="truncate font-semibold">{place.name}</span>
      )}
      <span className="truncate text-xs text-neutral-500">{place.roadAddress}</span>
      <span className="text-xs text-neutral-500">{distanceLabel(place.distance)}</span>
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
    return (
      <span
        ref={markRef}
        tabIndex={-1}
        className="shrink-0 text-xs font-semibold text-neutral-500"
      >
        정하신 곳
      </span>
    );
  }
  return (
    <button type="button" onClick={() => onDecide(place)} className={SMALL_BUTTON_CLASS}>
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
    <section className="flex w-full flex-col items-center gap-6">
      {/*
        회피가 한 일을 맨 위에서 밝힌다. 조용히 거르면 사용자에게 통제권이 없는 것과
        같기 때문이다. 회피를 껐을 때도 같은 자리에서 밝힌다 — 켜졌을 때만 알리고
        껐을 때는 침묵하면, 사용자가 자기가 만든 상태를 모르는 채로 남는다.
        둘 다 아니면(회피가 켜져 있고 뺀 것도 없으면) 줄 자체를 그리지 않는다.
        기록이 빈 사람에게는 이 화면이 예전 그대로여야 한다.
      */}
      {banner !== null ? (
        <div className="flex w-full flex-col items-center gap-2 rounded-xl bg-neutral-100 p-3 text-center dark:bg-neutral-900">
          <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
            {banner.text}
          </p>
          {banner.actionLabel !== null ? (
            <button type="button" onClick={onToggleAvoid} className={SMALL_BUTTON_CLASS}>
              {banner.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-neutral-500">오늘은</p>
        <h2 className="text-3xl font-bold tracking-tight break-keep">{cuisine}</h2>
        {total <= FEW ? (
          <p className="text-xs text-neutral-500">
            가까운 곳 중에서는 {total}곳을 찾았어요
          </p>
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

      <div className="flex w-full flex-col gap-2">
        {/*
          보여주지 못하고 남은 가게가 있을 때만 버튼을 둔다. 걸러진 것을 이미 전부
          보여주고 있는데 버튼을 두면, 눌러도 같은 목록이 그대로 남아
          이 화면이 고쳐 놓은 바로 그 인상을 다시 준다.
        */}
        {places.length < total ? (
          <button type="button" onClick={onReshuffle} className={BUTTON_CLASS}>
            다른 가게 보기
          </button>
        ) : null}
        <button type="button" onClick={onRestart} className={BUTTON_CLASS}>
          처음부터 다시
        </button>
      </div>
    </section>
  );
}
