"use client";

import { useState } from "react";
import { fetchSpots, NearbyError } from "@/lib/api";
import { errorNotice } from "@/lib/errors";
import { appendSpots, queryForPage, type Spot } from "@/lib/spots";

type Props = {
  /** 시작 화면의 `OOO로 다시 찾기`가 이름으로 다시 찾지 못했을 때 입력창에 채워 둘 글자. */
  initialKeyword: string;
  onPick: (spot: Spot) => void;
  onBack: () => void;
  /**
   * 장소를 골라 그 좌표로 음식점을 조회하는 중인가(web/app/page.tsx의
   * `{kind:"loading", from:"search"}`). 이 화면은 그동안에도 계속 그려지므로
   * (그렇지 않으면 시작 화면이 잠깐 끼어드는 문제가 있었다), 돌아가기·찾기·목록
   * 각 줄·더 보기를 여기서 직접 잠가야 한다 — 잠그지 않으면 조회가 끝나기 전에
   * 다른 장소를 또 고를 수 있어 조회 두 개가 동시에 돈다.
   *
   * 입력창만은 잠그지 않는다. 조회가 끝나면(성공이든 실패든) 이 화면은
   * page.tsx에서 다른 화면으로 통째로 바뀌어 사라지므로, 그 사이 입력창을
   * 고쳐도 그 값이 남거나 잘못 쓰이는 경로가 없다.
   */
  picking: boolean;
};

export default function SearchScreen({ initialKeyword, onPick, onBack, picking }: Props) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [page, setPage] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const [loading, setLoading] = useState(false);
  // 제목과 설명을 함께 들고 있는다. 제목만 남기면 "서버에 연결하지 못했어요"까지만
  // 보이고 "인터넷 연결을 확인한 뒤 다시 시도해 주세요"라는 다음 행동 안내가 사라진다.
  // lib/errors.ts가 그 둘을 나눠 두는 까닭이 바로 그것이다.
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  // 방금 어떤 글자로 찾았는지. 입력창을 고치는 도중에도 목록의 출처가 바뀌지
  // 않아야 하므로 keyword와 따로 둔다.
  const [searched, setSearched] = useState("");

  async function search(nextPage: number) {
    // 2쪽 이상(더 보기)은 입력창이 아니라 방금 찾았던 글자를 써야 한다 —
    // 그 이유는 web/lib/spots.ts의 queryForPage에 적어 두었다.
    const trimmed = queryForPage(nextPage, keyword, searched);
    if (trimmed === "" || loading || picking) return;
    setLoading(true);
    setError(null);
    try {
      const got = await fetchSpots(trimmed, nextPage);
      // 이어 붙이는 규칙은 lib/spots.ts가 갖는다. 여기서 직접 합치면
      // 카카오가 마지막 쪽을 되풀이해 줄 때 같은 장소가 끝없이 쌓이는 것을
      // 아무 시험도 막지 못한다.
      setSpots((prev) => (nextPage === 1 ? got.spots : appendSpots(prev, got.spots)));
      setIsEnd(got.isEnd);
      setPage(nextPage);
      setSearched(trimmed);
    } catch (cause) {
      const code = cause instanceof NearbyError ? cause.code : "unexpected";
      const message = cause instanceof NearbyError ? cause.message : "";
      if (!(cause instanceof NearbyError)) {
        console.error("[SearchScreen] 예상하지 못한 오류", cause);
      }
      const notice = errorNotice(code, message);
      setError({ title: notice.title, description: notice.description });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rise flex w-full grow flex-col gap-4" aria-busy={picking}>
      <button
        type="button"
        // 조회 중에는 뒤로 가지 못하게 막는다. 막지 않으면 그 사이 조회가
        // 끝나 page.tsx가 이 화면을 candidates·error로 갈아 치우면서, 사용자가
        // 스스로 되돌아간 시작 화면을 다시 빼앗는다.
        onClick={picking ? undefined : onBack}
        aria-disabled={picking}
        className="btn self-start text-muted underline underline-offset-4"
      >
        돌아가기
      </button>

      <h2 className="text-2xl font-bold tracking-tight text-balance">어디에서 찾을까요?</h2>

      {/*
        form으로 감싸는 이유: 입력창에서 Enter를 눌렀을 때도 찾아지게 하기 위해서다.
        단추만 두면 손가락으로 쓰는 사람은 괜찮지만 키보드를 쓰는 사람은
        입력창을 떠나 단추로 옮겨 가야 한다.
        onSubmit에서 preventDefault를 하지 않으면 페이지가 통째로 새로 뜬다.
      */}
      <form
        className="flex w-full gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search(1);
        }}
      >
        {/* 눈에 보이는 이름표가 없으면 화면 낭독기 사용자는 이 칸이 무엇을 받는지 모른다. */}
        <label htmlFor="spot-query" className="sr-only">
          찾을 장소 이름
        </label>
        <input
          id="spot-query"
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="경주, 강남역, 제주시 애월읍…"
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2"
        />
        <button
          type="submit"
          aria-disabled={loading || picking || keyword.trim() === ""}
          aria-busy={loading}
          className="btn btn-primary shrink-0"
        >
          {loading ? "찾는 중…" : "찾기"}
        </button>
      </form>

      {error !== null ? (
        <div className="w-full rounded-xl border border-line p-3">
          <p className="font-semibold">{error.title}</p>
          <p className="text-sm text-muted">{error.description}</p>
        </div>
      ) : null}

      <ul className="flex w-full flex-col gap-2">
        {spots.map((spot, index) => (
          /*
            key에 목록 위치를 섞는 이유: 카카오는 식별자가 빈 장소도 준다. 빈 문자열을
            그대로 key로 쓰면 그런 장소가 둘 이상일 때 React가 엉뚱한 줄을 재사용한다.
            lib/spots.ts가 빈 식별자를 중복 판정에서 빼고 그대로 살리므로 실제로 둘 이상 올 수 있다.
          */
          <li key={spot.id !== "" ? spot.id : `i-${index}`}>
            <button
              type="button"
              // 조회 중에는 다른 장소를 고르지 못하게 막는다. 막지 않으면 조회
              // 두 개가 동시에 돌고, 나중에 끝난 쪽이 화면을 차지해 방금 고른
              // 장소가 아닌 엉뚱한 결과가 뜬다.
              onClick={picking ? undefined : () => onPick(spot)}
              aria-disabled={picking}
              className="row flex w-full items-center justify-between gap-3 rounded-xl border border-line p-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {spot.name}
                  {spot.category !== "" ? (
                    <span className="ml-2 text-sm font-normal text-muted">{spot.category}</span>
                  ) : null}
                </span>
                <span className="block truncate text-sm text-muted">{spot.address}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/*
        한 번이라도 찾았고 결과가 없을 때만 알린다. keyword가 아니라 searched로
        판단하는 이유: keyword는 사용자가 타자를 칠 때마다 바뀌므로, 그것으로 판단하면
        첫 글자를 치는 순간 "찾지 못했어요"가 뜬다.
      */}
      {searched !== "" && spots.length === 0 && !loading && error === null ? (
        <p className="text-muted">그런 이름의 장소를 찾지 못했어요. 다른 말로 찾아보세요.</p>
      ) : null}

      {spots.length > 0 && !isEnd ? (
        <button
          type="button"
          onClick={loading || picking ? undefined : () => void search(page + 1)}
          aria-disabled={loading || picking}
          aria-busy={loading}
          className="btn btn-quiet w-full"
        >
          더 보기
        </button>
      ) : null}

      {/*
        끝에 닿았을 때 빠져나갈 길을 알린다. 카카오는 한 검색어에 많아야 45곳까지만
        내주므로(검색어에 따라 그보다 적다), 원하는 곳이 그 안에 없으면 사용자가
        검색어를 좁히는 것 말고는 방법이 없다. 그 사실을 알리지 않으면 사용자는
        `더 보기`가 사라진 것을 고장으로 받아들인다.
      */}
      {spots.length > 0 && isEnd ? (
        <p className="text-sm text-muted">
          여기까지가 전부입니다. 못 찾으셨다면 `경주 보문단지`처럼 더 좁혀서 찾아보세요.
        </p>
      ) : null}

      {/*
        눈에는 보이지 않고 화면 낭독기만 읽는 영역. 목록이 늘어난 것을 소리로 알린다.
        `더 보기`는 화면을 바꾸는 것이 아니라 포커스가 그 단추에 그대로 있으므로,
        이 영역이 없으면 무엇이 달라졌는지 들을 방법이 없다.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {picking
          ? "선택한 곳 주변 음식점을 찾고 있습니다."
          : loading
            ? "장소를 찾고 있습니다."
            : spots.length > 0
              ? `${spots.length}곳을 찾았습니다.`
              : ""}
      </p>
    </section>
  );
}
