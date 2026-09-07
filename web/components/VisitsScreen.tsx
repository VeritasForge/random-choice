import { useEffect, useRef } from "react";
import { forgetNotice } from "@/lib/reasons";
import { RETENTION_DAYS, type Visit } from "@/lib/visits";

type Props = {
  visits: readonly Visit[];
  avoidOn: boolean;
  onToggleAvoid: () => void;
  onForget: (placeId: string) => void;
  onForgetAll: () => void;
  /** 방금 지운 곳 수. 0이면 안내 줄을 그리지 않는다. 문구는 web/lib/reasons.ts가 만든다. */
  undoneCount: number;
  onUndo: () => void;
  onBack: () => void;
};

/**
 * 날짜는 "9월 6일"까지만 적는다. 보관 기간이 2주라 연도는 늘 올해이고,
 * 시각까지 적으면 "언제 갔더라"를 가려내는 데 도움이 안 되면서 줄만 길어진다.
 *
 * Date.parse가 실패할 걱정은 하지 않아도 된다 — readVisits가 파싱되지 않는 at을
 * 이미 걸러 내고 돌려주기 때문이다(web/lib/visits.ts의 isVisit).
 */
const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });

export default function VisitsScreen({
  visits,
  avoidOn,
  onToggleAvoid,
  onForget,
  onForgetAll,
  undoneCount,
  onUndo,
  onBack,
}: Props) {
  const notice = forgetNotice(undoneCount);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const undoButtonRef = useRef<HTMLButtonElement>(null);
  const prevUndoneCount = useRef(undoneCount);

  // 지운 직후 그 자리가 사라져(줄 전체가 없어진다) 포커스가 body로 떨어진다.
  // 되돌리기 버튼으로 옮겨 그 자리를 대신한다. 되돌린 직후에는 안내 줄 자체가
  // 사라지므로 제목으로 옮긴다 — ResultScreen이 "정하신 곳"에 포커스를 옮기는
  // 것과 같은 수법이다.
  useEffect(() => {
    if (undoneCount === prevUndoneCount.current) {
      return;
    }
    prevUndoneCount.current = undoneCount;
    if (undoneCount > 0) {
      undoButtonRef.current?.focus();
    } else {
      headingRef.current?.focus();
    }
  }, [undoneCount]);

  return (
    // grow·my-auto로 버튼 묶음을 화면 아래쪽에 붙인다(까닭은 StartScreen에 적어 두었다).
    <section className="rise flex w-full grow flex-col">
      <div className="my-auto flex w-full flex-col items-center gap-5 py-6">
        {/* tabIndex={-1}은 되돌린 직후 포커스를 여기로 옮기기 위한 것이다(위 useEffect 참고). */}
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-balance">
          최근에 정하신 곳
        </h2>

        {/*
          체크박스가 아니라 aria-pressed를 단 버튼을 쓰는 이유: 화면 낭독기가
          눌림/안 눌림을 버튼 자체의 상태로 곧바로 읽어 준다. 체크박스는 라벨을
          따로 엮어야 같은 말을 하고, 엮는 방식에 따라 낭독기마다 다르게 읽힌다.
          눈으로 보는 사람을 위해 켜짐/꺼짐을 글자로도 적는다.

          켜져 있을 때 테두리를 강조색이 아니라 글자색으로 두는 이유: 강조색은
          결과와 주요 버튼에만 쓴다. 여기까지 쓰면 무엇이 다음 걸음인지 흐려진다.
        */}
        <button
          type="button"
          aria-pressed={avoidOn}
          onClick={onToggleAvoid}
          className={`btn w-full justify-between gap-3 rounded-xl border p-4 text-left ${
            avoidOn ? "border-foreground" : "border-line"
          }`}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">최근에 정한 곳은 빼고 추천하기</span>
            <span className="text-base font-normal text-muted">
              아래 목록에 있는 가게를 결과에서 뺍니다
            </span>
          </span>
          <span className="shrink-0 text-base font-semibold">{avoidOn ? "켜짐" : "꺼짐"}</span>
        </button>

        {/*
          눈에는 보이지 않고 화면 낭독기만 읽는 영역. 다른 화면 셋(StartScreen·
          CandidateScreen·ResultScreen)과 같은 모양이다 — 영역 자체는 항상 그려
          두고 글자만 갈아 끼운다. 영역이 내용과 함께 DOM에 새로 삽입되면
          낭독기가 읽지 않는 것이 알려진 함정이라, 조건부로 통째로 넣고 빼면
          이 줄이 전달하려는 "n곳을 지웠어요" 자체가 낭독기에 들리지 않는다.

          **아래 보이는 상자와 다른 말을 담는다.** 같은 문자열을 두 자리에 그대로
          두면, 낭독기 사용자가 읽기 커서로 화면을 훑을 때 같은 문장을 두 번
          마주친다(다른 세 화면도 낭독기 영역과 보이는 문구의 내용이 서로 다르다).
          몇 곳을 지웠는지는 반드시 들려야 하므로 그 수는 그대로 두고, 눈으로는
          버튼이 보여서 알 수 있는 사실 — 되돌릴 수 있다는 것 — 을 말로 덧붙인다.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {notice !== null ? `${notice}. 아래 되돌리기 버튼으로 되살릴 수 있어요.` : ""}
        </p>

        {/*
          방금 지운 결과를 알린다. 지운 직후 눈이 가 있는 자리라 목록 위, 회피
          스위치 아래에 둔다. ResultScreen의 회피 안내 상자와 같은 모양(테두리 있는
          bg-surface)을 써서 화면 사이 일관성을 준다. 낭독기 통지는 위 sr-only
          영역이 맡으므로 이 상자 자체에는 aria-live를 달지 않는다 — 달면 같은
          내용이 두 번 들린다.
        */}
        {notice !== null ? (
          <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-surface p-3 text-center">
            <p className="text-base leading-relaxed text-muted">{notice}</p>
            <button
              ref={undoButtonRef}
              type="button"
              onClick={onUndo}
              className="btn btn-quiet btn-sm"
            >
              되돌리기
            </button>
          </div>
        ) : null}

        {visits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="font-semibold">아직 정하신 곳이 없어요</p>
            <p className="max-w-xs text-base leading-relaxed text-muted">
              결과 화면에서 <strong className="font-semibold">여기로 정했어요</strong>를
              누르면 여기에 쌓입니다.
            </p>
          </div>
        ) : (
          <>
            <ul className="flex w-full flex-col gap-2">
              {visits.map((visit) => (
                // key로 placeId를 그대로 쓴다. 기록에는 빈 ID가 들어가지 않고
                // (recordVisit이 거부한다), 같은 가게를 다시 정하면 옛 기록을 지우고
                // 새로 넣으므로 같은 ID가 둘일 수 없다.
                <li
                  key={visit.placeId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-lg font-semibold">{visit.placeName}</span>
                    <time dateTime={visit.at} className="text-base text-muted">
                      {DATE_FORMAT.format(new Date(visit.at))}
                    </time>
                  </span>
                  {/*
                    버튼 글자는 "지우기" 하나뿐이라 낭독기로 목록을 훑으면 같은 말이
                    줄 수만큼 반복된다. 어느 가게를 지우는 버튼인지 aria-label로 밝힌다.
                  */}
                  <button
                    type="button"
                    onClick={() => onForget(visit.placeId)}
                    aria-label={`${visit.placeName} 기록 지우기`}
                    className="btn btn-quiet btn-sm shrink-0"
                  >
                    지우기
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-base text-muted">
              {RETENTION_DAYS}일이 지난 기록은 저절로 사라져요
            </p>
          </>
        )}
      </div>

      <div className="flex w-full flex-col gap-3">
        {/*
          "전체 지우기"만 다른 옷을 입힌다(btn-danger-quiet). 바로 아래 "돌아가기"와
          12px 간격으로 붙어 있는데, 하나는 최대 2주치 기록을 한 번에 없애고
          다른 하나는 그냥 이전 화면으로 간다. 걸으면서 한 손으로 누르는 화면이라
          같은 옷을 입혀 두면 안 된다. 색과 명암비는 app/globals.css에 적어 두었다.

          되돌리기가 붙었지만 이 자리가 여전히 조심스러운 이유: 되돌리기는 **이 화면을
          벗어나면 사라진다**("돌아가기"가 되돌릴 목록을 비운다 — app/page.tsx).
          즉 지우고 나가 버리면 그때는 정말로 복구가 없다.
        */}
        {visits.length > 0 ? (
          <button type="button" onClick={onForgetAll} className="btn btn-danger-quiet w-full">
            전체 지우기
          </button>
        ) : null}
        <button type="button" onClick={onBack} className="btn btn-quiet w-full">
          돌아가기
        </button>
      </div>
    </section>
  );
}
