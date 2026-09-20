import type { Cuisine } from "@/lib/api";
import { countLabel } from "@/lib/reasons";

type Props = {
  candidates: Cuisine[];
  onChoose: (cuisine: Cuisine) => void;
  onReshuffle: () => void;
  onDecideForMe: () => void;
  /**
   * 무엇을 기준으로 찾았는지 알리는 문구. lib/anchor.ts의 anchorLabel이 만든 것을
   * 그대로 받는다.
   *
   * **이 화면에서 문구를 만들지 않는다.** 긴 이름을 줄이는 규칙이 여기 들어오면
   * 아무 시험도 그것을 지키지 못한다 — 화면 시험은 브라우저 없이 돌아 .tsx 파일에
   * 닿지 못하기 때문이다(web/vitest.config.mts).
   */
  whereLabel: string;
  /** 기준 위치를 바꾸러 간다. */
  onChangeWhere: () => void;
};

export default function CandidateScreen({
  candidates,
  onChoose,
  onReshuffle,
  onDecideForMe,
  whereLabel,
  onChangeWhere,
}: Props) {
  return (
    // grow·my-auto로 버튼 묶음을 화면 아래쪽에 붙인다(까닭은 StartScreen에 적어 두었다).
    <section className="rise flex w-full grow flex-col">
      {/*
        무엇을 기준으로 찾았는지 맨 위에서 밝힌다. 화면을 몇 번 넘기면 자기가 어느
        위치 기준으로 보고 있는지 잊기 때문이다. 모양은 ResultScreen의 안내 상자와
        같은 결(border-line + bg-surface)을 쓴다 — bg-surface만으로는 화면 바탕과
        거의 구분되지 않는다(app/globals.css, ResultScreen.tsx 참고).
      */}
      <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
        {/* truncate로 자르는 것은 눈에 보이는 폭만 다룬다. 글자 수를 줄이는 일은
            lib/anchor.ts가 이미 했고, 이것은 그보다 좁은 화면을 위한 마지막 방어다. */}
        <span className="truncate text-sm text-muted">{whereLabel}에서 찾았어요</span>
        <button type="button" onClick={onChangeWhere} className="btn btn-quiet btn-sm shrink-0">
          바꾸기
        </button>
      </div>

      <div className="my-auto flex w-full flex-col items-center gap-6 py-8">
        {/* text-balance: 좁은 화면에서 제목 마지막 줄에 한 글자만 남는 것을 막는다. */}
        <h2 className="text-2xl font-bold tracking-tight text-balance">어느 쪽이 끌리나요?</h2>

        <div className="grid w-full grid-cols-2 gap-3">
          {candidates.map((cuisine) => (
            <button
              // key는 화면에 보이는 이름이 아니라 id다. 서로 다른 종류가 같은 이름을
              // 갖게 되어도 key가 겹치지 않아야, React가 목록을 다시 그릴 때
              // 엉뚱한 버튼을 재사용하지 않는다.
              key={cuisine.id}
              type="button"
              onClick={() => onChoose(cuisine)}
              className="btn btn-quiet min-h-28 flex-col gap-1 rounded-2xl px-3"
            >
              <span className="text-lg">{cuisine.label}</span>
              {/*
                곳 수를 함께 적는 이유: 한 곳뿐인 종류를 고르면 "다른 가게 보기"가
                아예 붙지 않는데, 그 사정을 미리 알리지 않으면 고른 뒤에야 알게 된다.
              */}
              <span className="text-base font-normal text-muted">
                {countLabel(cuisine.count)}
              </span>
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
      </div>

      {/*
        강조색 버튼을 맨 아래에 둔다. 엄지가 가장 쉽게 닿는 자리가 화면 아래쪽이고,
        이 화면에서 다음 걸음은 "정해 주세요" 하나이기 때문이다.
      */}
      <div className="flex w-full flex-col gap-3">
        <button type="button" onClick={onReshuffle} className="btn btn-quiet w-full">
          다시 뽑기
        </button>
        <button type="button" onClick={onDecideForMe} className="btn btn-primary w-full">
          못 고르겠어요, 정해 주세요
        </button>
      </div>
    </section>
  );
}
