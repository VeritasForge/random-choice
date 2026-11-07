import { RETENTION_DAYS } from "@/lib/visits";

/*
  노렌 한 폭. relative는 before(막대에 거는 고리)와 after(박음질)를 이 폭 안에 붙이기 위한 것이다.
  고리는 폭의 위쪽 가운데에서 막대(높이 6px) 위로 10px 솟아 막대를 감싼 모양을 낸다.
  박음질은 위쪽을 뺀 세 변을 6px 안쪽으로 두른 점선이다.
*/
const NOREN_PANEL =
  "relative flex h-24 items-center rounded-b-[3px] bg-noren px-3 text-noren-ink " +
  "before:absolute before:-top-2.5 before:left-1/2 before:z-10 before:h-2.5 before:w-4 before:-translate-x-1/2 before:rounded-t-[3px] before:bg-noren " +
  "after:pointer-events-none after:absolute after:inset-x-1.5 after:top-0 after:bottom-1.5 after:rounded-b-[2px] after:border after:border-t-0 after:border-dashed after:border-noren-ink/45";

type Props = {
  /** 마지막으로 고른 장소 이름. 빈 문자열이면 `OOO 다시 찾기` 단추를 그리지 않는다. */
  lastSpotName: string;
  onResume: () => void;
  onStartHere: () => void;
  onStartElsewhere: () => void;
  loading: boolean;
  onShowVisits: () => void;
};

export default function StartScreen({
  lastSpotName,
  onResume,
  onStartHere,
  onStartElsewhere,
  loading,
  onShowVisits,
}: Props) {
  return (
    /*
      grow와 my-auto를 함께 쓰는 이유: 주요 버튼을 화면 아래쪽에 두기 위해서다.
      관찰 조사에서 한 손 그립이 49%, 전체 터치의 75%가 엄지였다(Hoober 2013).
      화면 가운데에 버튼을 두면 엄지가 닿지 않는 사람이 손을 고쳐 잡아야 한다.
      grow가 이 구역을 화면 높이만큼 늘리고, 위쪽 덩어리의 my-auto가 남는 공간을
      위아래로 나눠 가지면서 버튼 묶음이 맨 아래로 밀린다.
    */
    <section className="rise flex w-full grow flex-col">
      <div className="my-auto flex flex-col items-center gap-5 py-8 text-center">
        {/*
          서비스 이름을 노렌(가게 입구에 거는 짧은 천)에 얹은 모양이다. 그림이나 이미지 파일 없이
          CSS 도형만 쓴다. 천의 갈라진 틈이 띄어쓰기 자리에 놓이도록 단어마다 한 폭으로 나눠
          글자가 틈에 잘리지 않는다.
          - 막대는 장식이므로 aria-hidden이다. 제목은 <h1> 하나이고, 폭 사이의 {" "}가 낭독기와
            textContent에서 "오늘은 뭐 먹지?"가 되도록 띄어쓰기를 지킨다.
          - 노렌다움은 세 가지로 낸다: 쪽빛 남색 천에 크림색 글자(NOREN_PANEL의 bg-noren과
            text-noren-ink), 막대에 천을 걸어 맨 고리(before), 천 가장자리를 두른 박음질(after,
            위쪽은 막대에 달려 있어 없다). 색은 DESIGN.md의 Noren Title에 명암비와 함께 적었다.
          - 글자 크기를 화면 폭에 비례(9vw)하게 줄여, 320px 폭에서도 세 폭이 한 줄에 들어간다.
            390px에서는 상한(2.25rem)에 가까워 기존 제목과 크기가 같다.
          - 흔들리는 움직임은 넣지 않는다. 열 때마다 반복되면 거슬리고, 이 화면의 움직임은
            .rise 하나로 한정되어 있다.
        */}
        <div className="flex w-fit max-w-full flex-col items-stretch gap-0">
          <div aria-hidden="true" className="-mx-2 h-1.5 rounded-full bg-foreground" />
          <h1 className="flex justify-center gap-[5px] text-[clamp(1.75rem,9vw,2.25rem)] leading-none font-bold tracking-tight break-keep whitespace-nowrap">
            <span className={NOREN_PANEL}>오늘은</span> <span className={NOREN_PANEL}>뭐</span>{" "}
            <span className={NOREN_PANEL}>먹지?</span>
          </h1>
        </div>
        <div className="flex max-w-xs flex-col gap-3 rounded-xl border border-line bg-background px-4 py-3">
        <p className="text-base leading-relaxed text-balance break-keep text-muted">
          주변에 있는 음식점을 보고 <strong className="font-semibold">무엇을 먹을지</strong>부터
          좁혀 드립니다. 후보를 직접 적지 않아도 됩니다.
        </p>
        {/*
          위치를 왜 쓰는지와 무엇이 남는지를 처음 온 사람에게 밝힌다(제품 원칙 3·4).
          사실 근거: 서버에는 저장소가 없고, 이 기기에 남는 것은 마지막 검색어·정한 가게
          (14일)·"최근에 정한 곳 빼기" 설정이다(lib/anchor.ts·lib/visits.ts의 저장 키).
          보관 기간은 RETENTION_DAYS를 쓴다.
        */}
        <p className="text-base leading-relaxed text-balance break-keep text-muted">
          위치는 주변 음식점을 찾을 때만 쓰고 저장하지 않아요. 이 기기에는 마지막 검색어와
          정한 가게({RETENTION_DAYS}일)만 남아요.
        </p>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        {/*
          조건부 그리기에 && 가 아니라 삼항 연산자를 쓴다. `lastSpotName && <button>`은
          빈 문자열일 때 ""를 그대로 그려 넣는다. 지금은 눈에 보이지 않지만, 이 자리가
          수를 담는 값으로 바뀌면 화면에 0이 뜬다.
        */}
        {lastSpotName !== "" ? (
          <button
            type="button"
            onClick={loading ? undefined : onResume}
            aria-disabled={loading}
            className="btn btn-primary w-full"
          >
            {/* 이름 뒤에 조사를 붙이지 않는다. `로/으로`는 받침에 따라 갈려
                `경주역로`처럼 틀리기 쉽고, 이름 끝이 숫자·영문이면 판정할 수도 없다. */}
            {lastSpotName} 다시 찾기
          </button>
        ) : null}
        {/*
          disabled 대신 aria-disabled를 쓰는 이유: 방금 누른 버튼을 disabled로 만들면
          브라우저가 그 버튼의 포커스를 떨어뜨린다. 키보드나 화면 낭독기를 쓰는 사람은
          자기 위치를 잃고, 무슨 일이 시작됐는지도 듣지 못한다.
          aria-disabled는 "지금은 누를 수 없음"만 알리고 포커스는 그대로 둔다.
          실제로 눌리지 않게 하는 것은 아래 onClick의 삼항 연산자가 맡는다.
        */}
        <button
          type="button"
          onClick={loading ? undefined : onStartHere}
          aria-disabled={loading}
          aria-busy={loading}
          className={lastSpotName !== "" ? "btn btn-quiet w-full" : "btn btn-primary w-full"}
        >
          {loading ? "주변을 살펴보는 중…" : "지금 있는 곳에서 찾기"}
        </button>
        <button
          type="button"
          onClick={loading ? undefined : onStartElsewhere}
          aria-disabled={loading}
          className="btn btn-quiet w-full"
        >
          다른 곳에서 찾기
        </button>
        {/*
          조회 중에는 누르지 못하게 막는다. 막지 않으면 기록 화면으로 넘어간 뒤
          조회가 끝나는 순간 후보 화면이 그 자리를 빼앗아, 사용자는 자기가 연 화면을
          잃는다. disabled 대신 aria-disabled를 쓰는 까닭은 위 버튼과 같다 —
          포커스를 떨어뜨리지 않기 위한 것이다.
        */}
        <button
          type="button"
          onClick={loading ? undefined : onShowVisits}
          aria-disabled={loading}
          className="btn rounded-full bg-background px-5 text-muted underline underline-offset-4"
        >
          최근 기록 보기
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
      </div>
    </section>
  );
}
