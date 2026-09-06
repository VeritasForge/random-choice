import { RETENTION_DAYS, type Visit } from "@/lib/visits";

type Props = {
  visits: readonly Visit[];
  avoidOn: boolean;
  onToggleAvoid: () => void;
  onForget: (placeId: string) => void;
  onForgetAll: () => void;
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

const BUTTON_CLASS =
  "rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

export default function VisitsScreen({
  visits,
  avoidOn,
  onToggleAvoid,
  onForget,
  onForgetAll,
  onBack,
}: Props) {
  return (
    <section className="flex w-full flex-col items-center gap-6">
      <h2 className="text-2xl font-bold tracking-tight">최근에 정하신 곳</h2>

      {/*
        체크박스가 아니라 aria-pressed를 단 버튼을 쓰는 이유: 화면 낭독기가
        눌림/안 눌림을 버튼 자체의 상태로 곧바로 읽어 준다. 체크박스는 라벨을
        따로 엮어야 같은 말을 하고, 엮는 방식에 따라 낭독기마다 다르게 읽힌다.
        눈으로 보는 사람을 위해 켜짐/꺼짐을 글자로도 적는다.
      */}
      <button
        type="button"
        aria-pressed={avoidOn}
        onClick={onToggleAvoid}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
          avoidOn
            ? "border-neutral-900 dark:border-white"
            : "border-neutral-200 dark:border-neutral-800"
        }`}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">최근에 정한 곳은 빼고 추천하기</span>
          <span className="text-xs text-neutral-500">
            아래 목록에 있는 가게를 결과에서 뺍니다
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold">{avoidOn ? "켜짐" : "꺼짐"}</span>
      </button>

      {visits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-semibold">아직 정하신 곳이 없어요</p>
          <p className="max-w-xs text-sm leading-relaxed text-neutral-500">
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
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-semibold">{visit.placeName}</span>
                  <time dateTime={visit.at} className="text-xs text-neutral-500">
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
                  className="shrink-0 rounded-full border border-neutral-300 px-3 py-2 text-xs font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  지우기
                </button>
              </li>
            ))}
          </ul>

          <p className="text-xs text-neutral-500">
            {RETENTION_DAYS}일이 지난 기록은 저절로 사라져요
          </p>
        </>
      )}

      <div className="flex w-full flex-col gap-2">
        {visits.length > 0 ? (
          <button type="button" onClick={onForgetAll} className={BUTTON_CLASS}>
            전체 지우기
          </button>
        ) : null}
        <button type="button" onClick={onBack} className={BUTTON_CLASS}>
          돌아가기
        </button>
      </div>
    </section>
  );
}
