import type { Place } from "@/lib/api";

type Props = {
  cuisine: string;
  places: Place[];
  onRestart: () => void;
};

export default function ResultScreen({ cuisine, places, onRestart }: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-neutral-500">오늘은</p>
        <h2 className="text-3xl font-bold tracking-tight break-keep">{cuisine}</h2>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {places.map((place) => (
          <li key={place.id}>
            <a
              href={place.placeUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4 transition hover:border-neutral-900 dark:border-neutral-800 dark:hover:border-white"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{place.name}</span>
                <span className="truncate text-xs text-neutral-500">
                  {place.roadAddress}
                </span>
              </span>
              <span className="shrink-0 text-sm text-neutral-500">{place.distance}m</span>
            </a>
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
