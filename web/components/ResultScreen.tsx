import type { Place } from "@/lib/api";

type Props = {
  cuisine: string;
  places: Place[];
  total: number;
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
const LINK_CLASS = `${ROW_CLASS} transition hover:border-neutral-900 dark:hover:border-white`;
const BUTTON_CLASS =
  "rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

function PlaceRow({ place }: { place: Place }) {
  return (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{place.name}</span>
        <span className="truncate text-xs text-neutral-500">{place.roadAddress}</span>
      </span>
      <span className="shrink-0 text-sm text-neutral-500">{place.distance}m</span>
    </>
  );
}

export default function ResultScreen({
  cuisine,
  places,
  total,
  onReshuffle,
  onRestart,
}: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
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
          <li key={place.id || `unknown-${index}`}>
            {/*
              카카오가 place_url을 비워 보내는 경우가 있다(시험 자료에도 그 경우가 있다).
              빈 문자열을 href에 넣으면 브라우저가 "현재 문서"로 해석한다. 새 탭에서
              열리므로 지금 보고 있는 결과를 잃지는 않지만, 이 앱이 처음부터 다시
              열릴 뿐이라 사용자에게는 고장으로 보인다. 주소가 없으면 링크가 아니라
              그냥 목록 항목으로 그린다.
            */}
            {place.placeUrl ? (
              <a
                href={place.placeUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={LINK_CLASS}
              >
                <PlaceRow place={place} />
              </a>
            ) : (
              <div className={ROW_CLASS}>
                <PlaceRow place={place} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {/*
        눈에는 보이지 않고 화면 낭독기만 읽는 영역. 후보 화면과 같은 까닭이다 —
        "다른 가게 보기"는 화면 이름을 바꾸지 않아 포커스가 움직이지 않으므로,
        이것이 없으면 낭독기 사용자는 버튼을 누르고도 목록이 바뀌었는지 알 수 없다.
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
