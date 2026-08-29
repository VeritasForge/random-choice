type Props = {
  onStart: () => void;
  loading: boolean;
};

export default function StartScreen({ onStart, loading }: Props) {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        오늘 점심,
        <br />
        제가 정해 드릴게요
      </h1>
      <p className="max-w-xs text-sm leading-relaxed text-neutral-500">
        주변에 있는 음식점을 보고 <strong className="font-semibold">무엇을 먹을지</strong>부터
        좁혀 드립니다. 후보를 직접 적지 않아도 됩니다.
      </p>
      <button
        type="button"
        onClick={onStart}
        disabled={loading}
        className="rounded-full bg-neutral-900 px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {loading ? "주변을 살펴보는 중…" : "위치 허용하고 시작하기"}
      </button>
    </section>
  );
}
