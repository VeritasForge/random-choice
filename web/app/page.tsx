"use client";

import { useEffect, useRef, useState } from "react";
import CandidateScreen from "@/components/CandidateScreen";
import Notice from "@/components/Notice";
import ResultScreen from "@/components/ResultScreen";
import StartScreen from "@/components/StartScreen";
import {
  fetchNearby,
  NearbyError,
  type Cuisine,
  type NearbyResult,
  type Place,
} from "@/lib/api";
import { errorNotice } from "@/lib/errors";
import { getCurrentPosition, GeoError } from "@/lib/geo";
import { pickAvoiding, pickDistinct, pickOne } from "@/lib/pick";
import { pickPlaces } from "@/lib/places";
import { DEFAULT_RADIUS, widerThan } from "@/lib/radius";

const CANDIDATE_COUNT = 4;
// 결과 화면에 한 번에 보여줄 가게 수. 이보다 많이 남으면 나머지는 다시 뽑아서 본다.
const PLACE_COUNT = 4;

/**
 * 지금 무엇을 보여줄지를 하나의 값으로 관리한다.
 * 결과와 후보를 이 값 안에 함께 담아 두어, 화면 상태와 데이터가 어긋나지 않게 한다.
 * 여기 담긴 목록은 새로고침하면 사라진다. 어디에도 저장하지 않는다 —
 * 카카오가 결과 저장을 금지하기 때문이다.
 *
 * empty와 error가 radius를 함께 들고 다니는 이유: 다음 행동이 그 값에 달려 있다.
 * empty는 "방금 실패한 반경보다 넓은 것"만 제안해야 하고,
 * error의 다시 시도는 사용자가 넓혀 둔 반경을 그대로 이어받아야 한다.
 *
 * result가 pool과 places를 나눠 들고 다니는 이유: pool은 고른 종류에 해당하는 가게 전부이고,
 * places는 그중 지금 화면에 보이는 것이다. "다른 가게 보기"는 pool에서 다시 뽑는데,
 * 누를 때마다 목록을 새로 걸러 만들면 같은 가게라도 다른 객체가 되어
 * 직전 목록을 피하는 판정이 통하지 않는다(web/lib/places.ts에 까닭을 적어 두었다).
 */
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "candidates"; result: NearbyResult; candidates: Cuisine[] }
  | { kind: "result"; cuisine: Cuisine; pool: Place[]; places: Place[] }
  | { kind: "empty"; radius: number }
  | { kind: "error"; code: string; message: string; radius: number };

/**
 * 같은 id를 가진 종류가 겹치면 하나만 남긴다.
 *
 * 서버는 종류를 id별로 묶어 한 번씩만 보내 주지만, 그 성질은 JSON을 건너오면서
 * 타입에서 사라진다. 여기서 한 번 좁혀 두면 이후 추첨과 React key가 모두 유일성 위에서 돈다.
 * 보이는 이름이 아니라 id로 견주는 이유: 저장·대조의 기준이 id이고,
 * 화면 문구는 나중에 둘이 같아지도록 다듬어질 수 있다.
 *
 * 원소를 복사하지 않고 받은 객체를 그대로 돌려주는 것이 중요하다. "다시 뽑기"는
 * 직전 후보와 겹치지 않게 고르는데, 그 판정이 참조로 이뤄지기 때문이다
 * (까닭은 web/lib/places.ts에 적어 두었다).
 */
function distinctById(cuisines: readonly Cuisine[]): Cuisine[] {
  return [...new Map(cuisines.map((cuisine) => [cuisine.id, cuisine])).values()];
}

/**
 * 화면 단위 이름. start와 loading은 같은 화면의 두 상태이므로 하나로 본다 —
 * 시작 화면에서 로딩이 시작될 때 방금 누른 버튼에서 포커스를 빼앗지 않기 위한 것이다.
 * 빈 결과·오류 화면에서 다시 시도를 누를 때는 화면 이름이 start로 바뀌므로
 * 포커스가 main으로 옮겨 간다 — 그쪽은 이 규칙의 적용 대상이 아니다.
 */
function screenNameOf(view: View): string {
  return view.kind === "loading" ? "start" : view.kind;
}

export default function Home() {
  const [view, setView] = useState<View>({ kind: "start" });
  const mainRef = useRef<HTMLElement>(null);
  const screenName = screenNameOf(view);
  const shownScreen = useRef(screenName);

  // 화면이 바뀌면 포커스를 새 화면 맨 위로 옮긴다. 옮기지 않으면 키보드·화면 낭독기
  // 사용자는 사라진 요소에 포커스를 둔 채 남겨지고, 무엇이 그 자리를 대신했는지 듣지 못한다.
  useEffect(() => {
    if (shownScreen.current === screenName) {
      return;
    }
    shownScreen.current = screenName;
    mainRef.current?.focus();
  }, [screenName]);

  async function start(radius: number) {
    setView({ kind: "loading" });

    try {
      const coords = await getCurrentPosition();
      const result = await fetchNearby(coords.lat, coords.lng, radius);
      const cuisines = distinctById(result.cuisines);
      if (cuisines.length === 0) {
        setView({ kind: "empty", radius });
        return;
      }
      setView({
        kind: "candidates",
        result,
        candidates: pickDistinct(cuisines, CANDIDATE_COUNT, Math.random),
      });
    } catch (error) {
      // 오류의 출처가 셋이고, 각각 코드를 담는 방식이 다르다.
      // 어느 쪽도 아닌 오류는 우리가 예상하지 못한 것이므로, 원본을 콘솔에 남긴다 —
      // 남기지 않으면 사용자에게는 일반 안내만 뜨고 개발자에게는 단서가 하나도 없다.
      if (error instanceof NearbyError) {
        // 상태 코드를 콘솔에 남긴다. 남기지 않으면 "프록시가 목적지에 못 닿았다"와
        // "서버가 스스로 500을 냈다"의 구분이 던져진 다음 프레임에서 사라진다.
        console.error("[start] 조회 실패", error.code, error.status);
        setView({ kind: "error", code: error.code, message: error.message, radius });
        return;
      }
      if (error instanceof GeoError) {
        setView({ kind: "error", code: error.code, message: "", radius });
        return;
      }
      console.error("[start] 예상하지 못한 오류", error);
      setView({ kind: "error", code: "unexpected", message: "", radius });
    }
  }

  function reshuffle() {
    if (view.kind !== "candidates") return;
    const cuisines = distinctById(view.result.cuisines);
    setView({
      ...view,
      candidates: pickAvoiding(cuisines, CANDIDATE_COUNT, view.candidates, Math.random),
    });
  }

  function choose(cuisine: Cuisine) {
    if (view.kind !== "candidates") return;
    // 가게를 고른 종류에 맞추는 기준은 화면에 보이는 이름이 아니라 id다.
    const pool = view.result.places.filter((place) => place.cuisineId === cuisine.id);
    setView({
      kind: "result",
      cuisine,
      pool,
      places: pickPlaces(pool, PLACE_COUNT, [], Math.random),
    });
  }

  function decideForMe() {
    if (view.kind !== "candidates") return;
    const chosen = pickOne(view.candidates, Math.random);
    if (chosen === undefined) {
      // 후보 화면은 종류가 하나 이상일 때만 뜨므로 여기 닿으면 안 된다.
      // 닿았다면 버튼이 조용히 아무 일도 안 한 것처럼 보이므로 흔적을 남긴다.
      console.error("[decideForMe] 후보가 비어 있습니다", view.candidates);
      return;
    }
    choose(chosen);
  }

  function reshufflePlaces() {
    if (view.kind !== "result") return;
    setView({
      ...view,
      places: pickPlaces(view.pool, PLACE_COUNT, view.places, Math.random),
    });
  }

  // 이미 실패한 반경 이하는 제안하지 않는다(까닭은 lib/radius.ts에 적어 두었다).
  const widerRadii = view.kind === "empty" ? widerThan(view.radius) : [];

  const notice = view.kind === "error" ? errorNotice(view.code, view.message) : null;

  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 p-6 focus:outline-none"
    >
      {(view.kind === "start" || view.kind === "loading") && (
        <StartScreen
          onStart={() => start(DEFAULT_RADIUS)}
          loading={view.kind === "loading"}
        />
      )}

      {view.kind === "candidates" && (
        <CandidateScreen
          candidates={view.candidates}
          onChoose={choose}
          onReshuffle={reshuffle}
          onDecideForMe={decideForMe}
        />
      )}

      {view.kind === "result" && (
        <ResultScreen
          cuisine={view.cuisine}
          places={view.places}
          total={view.pool.length}
          onReshuffle={reshufflePlaces}
          onRestart={() => setView({ kind: "start" })}
        />
      )}

      {view.kind === "empty" && (
        <Notice
          title={`반경 ${view.radius}m 안에 음식점이 없어요`}
          description={
            widerRadii.length > 0
              ? "조금 더 넓게 찾아볼까요?"
              : "더 넓혀 봐도 찾지 못했어요. 다른 곳에서 다시 시도해 주세요."
          }
          actions={
            widerRadii.length > 0
              ? widerRadii.map((radius) => ({
                  label: `${radius / 1000}km로 넓히기`,
                  onClick: () => start(radius),
                }))
              : [{ label: "처음부터 다시", onClick: () => setView({ kind: "start" }) }]
          }
        />
      )}

      {view.kind === "error" && notice && (
        <Notice
          title={notice.title}
          description={notice.description}
          // 재시도가 소용없는 오류에는 버튼을 아예 두지 않는다.
          // "다시 시도"는 물론이고 "처음부터 다시"도 결국 같은 실패로 되돌아가므로,
          // 무엇이든 누를 것을 주면 방금 고친 빈 결과 화면과 같은 막다른 길이 된다.
          // 그런 오류의 안내 문구는 화면 밖에서 할 일(주소를 https로, 관리자에게 알리기,
          // 내일 다시)을 이미 담고 있다.
          actions={
            notice.retryable
              ? [{ label: "다시 시도", onClick: () => start(view.radius) }]
              : []
          }
        />
      )}
    </main>
  );
}
