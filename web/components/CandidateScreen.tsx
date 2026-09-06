import type { Cuisine } from "@/lib/api";

type Props = {
  candidates: Cuisine[];
  onChoose: (cuisine: Cuisine) => void;
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
            // key는 화면에 보이는 이름이 아니라 id다. 서로 다른 종류가 같은 이름을
            // 갖게 되어도 key가 겹치지 않아야, React가 목록을 다시 그릴 때
            // 엉뚱한 버튼을 재사용하지 않는다.
            key={cuisine.id}
            type="button"
            onClick={() => onChoose(cuisine)}
            className="flex min-h-28 items-center justify-center rounded-2xl border border-neutral-200 bg-white p-4 text-center text-base font-semibold break-keep transition hover:border-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-white"
          >
            {cuisine.label}
          </button>
        ))}
      </div>

      {/*
        눈에는 보이지 않고 화면 낭독기만 읽는 영역.
        "다시 뽑기"는 화면 이름을 바꾸지 않아 포커스가 움직이지 않으므로, 이것이 없으면
        낭독기 사용자는 버튼을 누르고도 후보가 바뀌었는지 아무 소리도 듣지 못한다.
        내용이 바뀔 때만 읽히므로 처음 들어올 때는 조용하다 — 그때는 포커스 이동이 알린다.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {`후보: ${candidates.map((cuisine) => cuisine.label).join(", ")}`}
      </p>

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
