"use client";

import { useEffect, useRef, useState } from "react";
import CandidateScreen from "@/components/CandidateScreen";
import Notice from "@/components/Notice";
import ResultScreen from "@/components/ResultScreen";
import StartScreen from "@/components/StartScreen";
import VisitsScreen from "@/components/VisitsScreen";
import {
  fetchNearby,
  NearbyError,
  type Cuisine,
  type NearbyResult,
  type Place,
} from "@/lib/api";
import { avoidVisited } from "@/lib/avoid";
import { distinctById } from "@/lib/cuisines";
import { errorNotice } from "@/lib/errors";
import { getCurrentPosition, GeoError } from "@/lib/geo";
import { pickAvoiding, pickDistinct, pickOne } from "@/lib/pick";
import { pickPlaces, WINDOW_STEP } from "@/lib/places";
import { DEFAULT_RADIUS, widerThan } from "@/lib/radius";
import { avoidNotice, canRestore } from "@/lib/reasons";
import {
  browserStore,
  forgetAll,
  forgetVisit,
  readAvoidOn,
  readVisits,
  recordVisit,
  writeAvoidOn,
  type Store,
  type Visit,
} from "@/lib/visits";

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
 */
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "candidates"; result: NearbyResult; candidates: Cuisine[] }
  | {
      kind: "result";
      cuisine: Cuisine;
      /**
       * 고른 종류의 가게 **전부**. 회피를 적용하기 **전**의 목록이다.
       * 회피를 껐을 때 빠졌던 가게를 되돌리려면 이것이 있어야 한다 —
       * 걸러진 pool만 들고 있으면 스위치를 꺼도 가게가 돌아오지 않는다.
       */
      all: Place[];
      /**
       * 회피를 적용한 뒤 남은 가게. 뽑기의 바탕이다.
       * places와 나눠 들고 다니는 이유: "다른 가게 보기"는 이 목록에서 다시 뽑는데,
       * 누를 때마다 목록을 새로 걸러 만들면 같은 가게라도 다른 객체가 되어
       * 직전 목록을 피하는 판정이 통하지 않는다(web/lib/places.ts에 까닭을 적어 두었다).
       */
      pool: Place[];
      /** 지금 화면에 보이는 가게. */
      places: Place[];
      /** 지금 창 크기. "다른 가게 보기"가 WINDOW_STEP씩 키운다. */
      windowSize: number;
      /** 회피가 몇 곳을 뺐는지. released와 반드시 함께 읽는다(web/lib/avoid.ts). */
      removed: number;
      /** 전부 빠져 이번만 회피를 풀었는지. */
      released: boolean;
    }
  | { kind: "visits" }
  | { kind: "empty"; radius: number }
  | { kind: "error"; code: string; message: string; radius: number };

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

  // 저장소는 브라우저에서만 얻을 수 있다. 서버에서 그릴 때는 null이다.
  const [store] = useState<Store | null>(() => browserStore());
  // 회피 스위치와 기록은 화면 상태(View) 밖에 둔다. View는 화면을 옮길 때마다
  // 통째로 갈아 끼우는 값이라, 그 안에 두면 기록 화면에 다녀오는 것만으로 설정이 날아간다.
  //
  // 처음 값이 true인 것은 저장된 설정을 아직 읽기 전이기 때문이다 — 실제 값은
  // 아래 useEffect가 저장소에서 읽어 덮는다. 기본값을 켜짐으로 두는 까닭은
  // web/lib/visits.ts의 readAvoidOn에 적어 두었다.
  const [avoidOn, setAvoidOn] = useState(true);
  const [visits, setVisits] = useState<Visit[]>([]);

  const mainRef = useRef<HTMLElement>(null);
  const screenName = screenNameOf(view);
  const shownScreen = useRef(screenName);

  // 처음 그려진 뒤에 기록과 회피 설정을 읽는다. 둘 다 브라우저에만 있는 저장소를
  // 만지므로, 그리는 중에 읽으면 서버가 만든 HTML과 브라우저의 첫 화면이 달라진다.
  // 그러면 React가 화면을 통째로 다시 만들고, 아래 포커스 처리가 무효가 된다.
  //
  // 아래 두 줄에 걸리는 규칙(set-state-in-effect)이 막으려는 것은 되풀이되는 연쇄
  // 렌더인데, 여기서 일어나는 것은 마운트 직후 한 번뿐이고 그 한 번이 바로 위에 적은
  // 값을 사는 대가다. 규칙대로 고치려면 useSyncExternalStore용 구독 장치가 필요한데,
  // 그것을 둘 자리는 이미 저장소 열쇠를 가진 lib/visits.ts다. 그 파일은 검토가 끝난
  // 모듈이라 이번 작업에서 크게 건드리지 않기로 했다 — 즉 이 예외는 "달리 방법이
  // 없어서"가 아니라 "이번 범위 밖이라서"다. 기록과 설정이 바뀌는 다른 경로
  // (정하기·지우기·스위치)는 모두 사용자 조작 안에서 바꾸므로 이 규칙에 걸리지 않는다.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 까닭은 바로 위에 적었다 */
    setVisits(readVisits(store));
    setAvoidOn(readAvoidOn(store));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [store]);

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
    const all = view.result.places.filter((place) => place.cuisineId === cuisine.id);
    const { places: pool, removed, released } = avoidVisited(all, visits, avoidOn);
    setView({
      kind: "result",
      cuisine,
      all,
      pool,
      places: pickPlaces(pool, PLACE_COUNT, [], Math.random, WINDOW_STEP),
      windowSize: WINDOW_STEP,
      removed,
      released,
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
    // 창을 한 단계 넓힌다. 넓히지 않으면 가까운 여덟 곳 안에서만 계속 돌아,
    // 그 여덟 곳을 다 본 뒤로는 눌러도 더 먼 가게가 영영 나오지 않는다.
    const windowSize = view.windowSize + WINDOW_STEP;
    setView({
      ...view,
      windowSize,
      places: pickPlaces(view.pool, PLACE_COUNT, view.places, Math.random, windowSize),
    });
  }

  /**
   * 사용자가 "여기로 정했어요"를 누른 가게를 기록한다.
   *
   * 지금 보고 있는 결과는 다시 거르지 않는다. 방금 정한 가게가 누르는 순간 눈앞에서
   * 사라지면 무슨 일이 일어났는지 알 수 없다. 회피는 다음 조회부터 듣게 하고,
   * 대신 기록이 늘어난 덕에 그 줄이 "정하신 곳"으로 바뀌어 기록된 사실을 알린다.
   */
  function decided(place: Place) {
    recordVisit(store, place.id, place.name);
    setVisits(readVisits(store));
  }

  function toggleAvoid() {
    const next = !avoidOn;
    setAvoidOn(next);
    // 저장한다. 하루 한 번 쓰는 서비스라 세션에만 남기면 껐던 사람이 다음 날
    // 말없이 켜진 화면을 보는데, 기록 화면은 이 값을 영구 설정처럼 보여 준다.
    writeAvoidOn(store, next);
    if (view.kind !== "result") return;
    // 지금 보고 있는 종류를 새 설정으로 다시 계산한다.
    // 그러지 않으면 스위치를 눌러도 화면이 그대로라 껐는지 켰는지 알 수 없다.
    //
    // **바탕은 view.pool이 아니라 view.all이다.** pool은 이미 걸러진 목록이라,
    // 그것을 바탕으로 쓰면 회피를 꺼도 빠졌던 가게가 돌아오지 않는다.
    const { places: pool, removed, released } = avoidVisited(view.all, visits, next);
    setView({
      ...view,
      pool,
      removed,
      released,
      windowSize: WINDOW_STEP,
      places: pickPlaces(pool, PLACE_COUNT, [], Math.random, WINDOW_STEP),
    });
  }

  function forget(placeId: string) {
    forgetVisit(store, placeId);
    setVisits(readVisits(store));
  }

  function forgetEverything() {
    forgetAll(store);
    setVisits(readVisits(store));
  }

  // 이미 실패한 반경 이하는 제안하지 않는다(까닭은 lib/radius.ts에 적어 두었다).
  const widerRadii = view.kind === "empty" ? widerThan(view.radius) : [];

  const notice = view.kind === "error" ? errorNotice(view.code, view.message) : null;

  return (
    <main
      ref={mainRef}
      tabIndex={-1}
      /*
        아래 여백을 안전 영역만큼 벌린다. 주요 버튼을 화면 맨 아래에 두었는데,
        홈 인디케이터가 있는 기기에서는 그 자리가 시스템 제스처 영역이라
        버튼을 누르려다 앱이 닫히거나 홈으로 나간다. env()가 0인 기기에서는
        max()가 원래 여백(1.5rem)을 그대로 고른다.
      */
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] focus:outline-none"
    >
      {(view.kind === "start" || view.kind === "loading") && (
        <StartScreen
          onStart={() => start(DEFAULT_RADIUS)}
          loading={view.kind === "loading"}
          onShowVisits={() => setView({ kind: "visits" })}
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
          cuisine={view.cuisine.label}
          places={view.places}
          total={view.pool.length}
          // removed만 보고 판단하지 않는다. 전부 빠져 이번만 푼 회차는 removed가 0으로
          // 오는데(관례다) 실제로는 뺄 것이 있었으므로, released를 먼저 보는
          // avoidNotice·canRestore에 둘 다 넘긴다. 두 판정을 화면 쪽 조건식으로
          // 흩어 두지 않고 reasons.ts에 모아 둔 까닭은 그 파일에 적어 두었다.
          notice={avoidNotice(view.removed, view.released)}
          avoidOn={avoidOn}
          canRestore={canRestore(view.removed, view.released)}
          onToggleAvoid={toggleAvoid}
          onDecide={decided}
          decidedIds={visits.map((visit) => visit.placeId)}
          onReshuffle={reshufflePlaces}
          onRestart={() => setView({ kind: "start" })}
        />
      )}

      {view.kind === "visits" && (
        <VisitsScreen
          visits={visits}
          avoidOn={avoidOn}
          onToggleAvoid={toggleAvoid}
          onForget={forget}
          onForgetAll={forgetEverything}
          onBack={() => setView({ kind: "start" })}
        />
      )}

      {view.kind === "empty" && (
        <Notice
          // 반경을 문구에 넣지 않는다. 조회기가 한 점이 아니라 다섯 점을 보게 되면서
          // 실제로 살펴본 범위가 요청 반경과 달라져, "반경 500m 안에 없어요"가 사실이 아니다.
          title="주변에서 음식점을 찾지 못했어요"
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
