import type { Place } from "@/lib/api";

type Props = {
  cuisine: string;
  places: Place[];
  onRestart: () => void;
};

const ROW_CLASS =
  "flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800";
const LINK_CLASS = `${ROW_CLASS} transition hover:border-neutral-900 dark:hover:border-white`;

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

export default function ResultScreen({ cuisine, places, onRestart }: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-neutral-500">오늘은</p>
        <h2 className="text-3xl font-bold tracking-tight break-keep">{cuisine}</h2>
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

      <button
        type="button"
        onClick={onRestart}
        className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        처음부터 다시
      </button>
    </section>
  );
}
