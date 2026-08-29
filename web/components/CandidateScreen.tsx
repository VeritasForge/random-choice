type Props = {
  candidates: string[];
  onChoose: (cuisine: string) => void;
  onReshuffle: () => void;
  onDecideForMe: () => void;
};

export default function CandidateScreen({
  candidates,
  onChoose,
  onReshuffle,
  onDecideForMe,
}: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <h2 className="text-2xl font-bold tracking-tight">어느 쪽이 끌리나요?</h2>

      <div className="grid w-full grid-cols-2 gap-3">
        {candidates.map((cuisine) => (
          <button
            key={cuisine}
            type="button"
            onClick={() => onChoose(cuisine)}
            className="flex min-h-28 items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 text-center text-base font-semibold break-keep transition hover:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-white"
          >
            {cuisine}
          </button>
        ))}
      </div>

      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onReshuffle}
          className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          다시 뽑기
        </button>
        <button
          type="button"
          onClick={onDecideForMe}
          className="rounded-full bg-neutral-900 px-6 py-3.5 text-base font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-neutral-900"
        >
          못 고르겠어요, 정해 주세요
        </button>
      </div>
    </section>
  );
}
