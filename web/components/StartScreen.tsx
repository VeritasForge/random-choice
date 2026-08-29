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
      {/*
        disabled 대신 aria-disabled를 쓰는 이유: 방금 누른 버튼을 disabled로 만들면
        브라우저가 그 버튼의 포커스를 떨어뜨린다. 키보드나 화면 낭독기를 쓰는 사람은
        자기 위치를 잃고, 무슨 일이 시작됐는지도 듣지 못한다.
        aria-disabled는 "지금은 누를 수 없음"만 알리고 포커스는 그대로 둔다.
        실제로 눌리지 않게 하는 것은 아래 onClick의 삼항 연산자가 맡는다.
      */}
      <button
        type="button"
        onClick={loading ? undefined : onStart}
        aria-disabled={loading}
        aria-busy={loading}
        className={`rounded-full bg-neutral-900 px-8 py-4 text-base font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-neutral-900 ${
          loading ? "opacity-50" : ""
        }`}
      >
        {loading ? "주변을 살펴보는 중…" : "위치 허용하고 시작하기"}
      </button>
      {/*
        눈에는 보이지 않고 화면 낭독기만 읽는 영역. 로딩이 "시작되는 것"을 소리로 알린다.
        버튼 글자만 바꾸면 포커스가 그 버튼에 없는 사람은 알 수 없기 때문이다.
        끝나는 것은 여기서 알리지 않는다 — 내용이 빈 문자열로 돌아가는 변화를
        낭독기는 읽지 않고, 로딩이 끝나면 대개 이 화면 자체가 사라진다.
        끝을 알리는 일은 그 자리를 대신하는 화면(page.tsx의 포커스 이동)이 맡는다.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading ? "주변 음식점을 찾고 있습니다." : ""}
      </p>
    </section>
  );
}
