"use client";

import { useEffect, useRef, useState } from "react";
import CandidateScreen from "@/components/CandidateScreen";
import Notice from "@/components/Notice";
import ResultScreen from "@/components/ResultScreen";
import SearchScreen from "@/components/SearchScreen";
import StartScreen from "@/components/StartScreen";
import VisitsScreen from "@/components/VisitsScreen";
import { type Anchor, anchorLabel, readLastSpotName, writeLastSpotName } from "@/lib/anchor";
import {
  fetchNearby,
  fetchSpots,
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
import { DEFAULT_RADIUS, WIDER_RADIUS } from "@/lib/radius";
import { avoidNotice, canRestore } from "@/lib/reasons";
import { resolveAnchor, type Spot } from "@/lib/spots";
import {
  browserStore,
  forgetAll,
  forgetVisit,
  readAvoidOn,
  readVisits,
  recordVisit,
  restoreVisits,
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
 */
type View =
  | { kind: "start" }
  | {
      kind: "loading";
      /**
       * 이 조회를 어느 화면에서 시작했는가. screenNameOf가 이 값을 읽어
       * 로딩 중에도 그 화면을 계속 보여 준다. 시작 화면과 검색 화면 둘 다에서
       * 조회가 시작될 수 있는데(검색 화면은 장소를 고르는 순간 조회가 시작된다),
       * 하나로 뭉뚱그리면 검색 화면에서 조회를 시작했을 때도 시작 화면이
       * 잠깐 떴다가 사라진다 — 그 화면의 버튼은 전부 죽어 있어 사용자가
       * 아무것도 할 수 없는 채로 몇 초를 기다리게 된다.
       */
      from: "start" | "search";
    }
  | {
      kind: "search";
      /**
       * 검색 화면의 입력창을 채워 둘 글자. `다른 곳에서 찾기`와 `바꾸기`는
       * "다른" 곳·"바뀐" 기준을 찾겠다는 뜻이니 비운다.
       *
       * `OOO로 다시 찾기`는 보통 이 화면을 거치지 않는다 — resumeAnchor가
       * 그 이름으로 곧장 결과를 구한다. 다만 그 이름으로 다시 찾지 못하면
       * (가게가 사라졌거나 이름이 바뀐 경우) 그 이름을 채운 채로 이 화면이
       * 뜬다 — 손으로 다시 찾으라는 뜻이다.
       */
      initialKeyword: string;
    }
  | { kind: "candidates"; anchor: Anchor; result: NearbyResult; candidates: Cuisine[] }
  | {
      kind: "result";
      anchor: Anchor;
      /**
       * 후보 화면으로 되돌아갈 때 쓴다(Task 9의 `다른 종류 고르기`).
       * 들고 있지 않으면 조회를 다시 해야 하는데, 그것은 카카오를 최대 123번 더 부르는 일이다.
       */
      result: NearbyResult;
      candidates: Cuisine[];
      /**
       * 고른 종류의 가게 **전부**. 회피를 적용하기 **전**의 목록이다.
       * 회피를 껐을 때 빠졌던 가게를 되돌리려면 이것이 있어야 한다 —
       * 걸러진 pool만 들고 있으면 스위치를 꺼도 가게가 돌아오지 않는다.
       */
      cuisine: Cuisine;
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
  /**
   * 빈 결과에도 기준점을 들고 있어야 한다. 들고 있지 않으면 `다시 찾아보기`가
   * 사용자가 서 있는 자리로 되돌아가, 경주를 찾던 사람이 갑자기 집 주변을 보게 된다.
   */
  | { kind: "empty"; anchor: Anchor }
  /**
   * 오류 화면에도 기준점을 들고 있어야 한다. 들고 있지 않으면 "다시 시도"가
   * 언제나 브라우저 위치로 조회한다 — 옮긴 위치에서 조회가 실패한 사람이
   * "다시 시도"를 눌러도 자기가 찾던 곳이 아니라 사용자가 서 있는 자리로
   * 돌아가고, 위치 권한을 거부한 사람은 그 순간 권한 요청 창까지 보게 된다.
   */
  | { kind: "error"; anchor: Anchor; code: string; message: string };

/**
 * 화면 단위 이름. loading은 그 조회를 시작한 화면(view.from)과 같은 화면으로 본다 —
 * 조회가 시작될 때 방금 누른 버튼(또는 방금 고른 장소)에서 포커스를 빼앗지 않기
 * 위한 것이다. 빈 결과·오류 화면에서 다시 시도를 누를 때는 화면 이름이 start로
 * 바뀌므로 포커스가 main으로 옮겨 간다 — 그쪽은 이 규칙의 적용 대상이 아니다.
 */
function screenNameOf(view: View): string {
  return view.kind === "loading" ? view.from : view.kind;
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
  // 방금 지운 것을 잠깐 들고 있다가 "되돌리기"로 되살릴 수 있게 한다. 저장소에는
  // 휴지통을 만들지 않는다 — 화면을 벗어나면(onBack) 이 목록도 함께 비운다.
  // View 밖에 두는 이유는 visits·avoidOn과 같다: View는 화면을 옮길 때마다
  // 통째로 갈아 끼우는 값이다.
  const [undoable, setUndoable] = useState<Visit[]>([]);
  // 마지막으로 고른 장소의 이름. visits·avoidOn과 같은 이유로 View 밖에 둔다 —
  // View는 화면을 옮길 때마다 통째로 갈아 끼우는 값이라, 그 안에 두면
  // 화면 하나 지나는 것만으로 설정이 날아간다.
  const [lastSpotName, setLastSpotName] = useState("");

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
    setLastSpotName(readLastSpotName(store) ?? "");
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

  async function start(
    anchor: Anchor,
    radius: number = DEFAULT_RADIUS,
    from: "start" | "search" = "start",
  ) {
    setView({ kind: "loading", from });

    try {
      // 기준점이 옮긴 자리면 브라우저 위치를 묻지 않는다. 물으면 위치 권한을
      // 거부한 사람이 검색으로 들어온 길에서도 막히고, 허용한 사람도 쓸데없이
      // 기다린다. 이 갈림이 이 기능의 핵심이다.
      const coords =
        anchor.kind === "here" ? await getCurrentPosition() : { lat: anchor.lat, lng: anchor.lng };
      const result = await fetchNearby(coords.lat, coords.lng, radius);
      const cuisines = distinctById(result.cuisines);
      if (cuisines.length === 0) {
        setView({ kind: "empty", anchor });
        return;
      }
      setView({
        kind: "candidates",
        anchor,
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
        setView({ kind: "error", anchor, code: error.code, message: error.message });
        return;
      }
      if (error instanceof GeoError) {
        // GeoError는 브라우저 위치를 물었을 때만 나므로(위 anchor.kind === "here"
        // 갈래), 여기 anchor는 항상 {kind:"here"}다.
        setView({ kind: "error", anchor, code: error.code, message: "" });
        return;
      }
      console.error("[start] 예상하지 못한 오류", error);
      setView({ kind: "error", anchor, code: "unexpected", message: "" });
    }
  }

  /**
   * 검색 화면에서 장소를 골랐을 때.
   *
   * **저장하는 것은 고른 장소의 이름뿐이다.** 좌표는 여전히 브라우저에 남기지
   * 않는다(web/lib/anchor.ts). 그래서 다음에 열었을 때는 `동백역 에버라인으로
   * 다시 찾기`가 보이고, 누르면 그 이름으로 곧장 결과를 구한다(resumeAnchor).
   */
  function pickSpot(spot: Spot) {
    writeLastSpotName(store, spot.name);
    setLastSpotName(spot.name);
    // from: "search" — 검색 화면에서 고른 것이므로 조회 중에도 검색 화면을
    // 그대로 보여 준다(위 View의 "loading" 갈래 주석).
    start({ kind: "spot", name: spot.name, lat: spot.lat, lng: spot.lng }, DEFAULT_RADIUS, "search");
  }

  /**
   * 시작 화면의 `OOO로 다시 찾기`를 눌렀을 때.
   *
   * 저장해 둔 것은 장소 이름뿐이고 좌표는 저장하지 않으므로(web/lib/anchor.ts),
   * 그 이름으로 카카오에 다시 물어 기준점을 새로 구한다. 검색 화면을 거치지
   * 않고 곧장 결과로 넘어가는 것이 이 함수의 핵심이다.
   *
   * 다시 찾지 못하면(이름이 바뀌었거나 없어진 가게, 또는 조회 자체가 실패)
   * 그 이름을 채운 검색 화면을 열어 손으로 다시 찾게 한다 — `OOO로 다시 찾기`가
   * 생기기 전의 동작과 같다. 이 실패를 오류 화면(view.kind === "error")으로
   * 보내지 않는 이유: 그 화면의 "다시 시도"는 이미 정해진 좌표로 다시 부르는
   * 것인데, 여기서는 아직 좌표를 구하지 못한 채로 실패했다.
   */
  async function resumeAnchor(name: string) {
    setView({ kind: "loading", from: "start" });
    let spots: Spot[];
    try {
      spots = (await fetchSpots(name, 1)).spots;
    } catch (cause) {
      console.error("[resumeAnchor] 이름으로 다시 찾기 실패", cause);
      setView({ kind: "search", initialKeyword: name });
      return;
    }
    const anchor = resolveAnchor(spots);
    if (anchor === null) {
      setView({ kind: "search", initialKeyword: name });
      return;
    }
    // 다시 찾은 이름으로 갱신한다. 카카오가 그때와 표기를 조금 다르게 돌려주면
    // (예: 지점명이 붙거나 빠지면) 다음에도 같은 곳을 곧장 찾을 수 있어야 한다.
    writeLastSpotName(store, anchor.name);
    setLastSpotName(anchor.name);
    await start(anchor, DEFAULT_RADIUS, "start");
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
      // 여기는 객체를 통째로 새로 만드는 자리다. 이 세 줄을 빠뜨리면
      // 결과 화면에서 기준 위치 줄이 사라지고 후보로 돌아갈 수도 없다.
      anchor: view.anchor,
      result: view.result,
      candidates: view.candidates,
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

  /**
   * 결과 화면에서 후보 화면으로 돌아간다.
   *
   * 조회를 다시 하지 않는 것이 핵심이다. 다시 하면 카카오를 최대 123번 더 부르고,
   * 옮긴 위치에서는 그 사이에 검색부터 다시 해야 한다.
   */
  function backToCandidates() {
    if (view.kind !== "result") return;
    setView({
      kind: "candidates",
      anchor: view.anchor,
      result: view.result,
      candidates: view.candidates,
    });
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
    // 지우기 전에 골라 둔다 — 지운 뒤에는 store에서 이 항목을 다시 찾을 수 없다.
    const removed = visits.filter((visit) => visit.placeId === placeId);
    forgetVisit(store, placeId);
    setVisits(readVisits(store));
    // 교체가 아니라 누적한다. 되돌리기 전에 줄을 두 번 지우면(드문 조작이 아니다)
    // 교체로는 두 번째 것이 첫 번째를 지워 버려 되돌릴 수 없게 된다. 누적하면
    // undoneCount가 매번 실제로 늘어나, 포커스 이동과 낭독기 통지가 매번 다시
    // 일어나고(VisitsScreen.tsx) 되돌리기도 지운 것을 전부 되살린다.
    setUndoable((prev) => [...prev, ...removed]);
  }

  function forgetEverything() {
    // 전체 지우기 시점의 visits에는 이미 forget으로 지운 항목이 없으므로(그 항목은
    // 이 함수 호출 전에 visits에서 빠졌다) 여기서도 누적해야 중복 없이 전부 모인다.
    const removed = visits;
    forgetAll(store);
    setVisits(readVisits(store));
    setUndoable((prev) => [...prev, ...removed]);
  }

  /** 방금 지운 것을 되돌린다. undoable이 비어 있으면(이미 되돌렸으면) 아무 일도 하지 않는다. */
  function undoForget() {
    if (undoable.length === 0) return;
    restoreVisits(store, undoable);
    setVisits(readVisits(store));
    setUndoable([]);
  }

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
      {/* loading은 그 조회를 시작한 화면에서만 그린다(from). start에서 시작한
          조회가 아니면 여기서는 아무것도 그리지 않는다 — 검색 화면 쪽 조건이 맡는다. */}
      {(view.kind === "start" || (view.kind === "loading" && view.from === "start")) && (
        <StartScreen
          lastSpotName={lastSpotName}
          // `OOO로 다시 찾기`는 그 장소로 곧장 다시 찾겠다는 버튼이므로 검색
          // 화면을 거치지 않고 resumeAnchor가 그 이름으로 곧장 결과를 구한다.
          onResume={() => resumeAnchor(lastSpotName)}
          onStartHere={() => start({ kind: "here" })}
          // `다른 곳에서 찾기`는 "다른" 곳을 찾겠다는 뜻이므로 비운다. 그 글자로
          // 다시 찾고 싶으면 `~로 다시 찾기`가 따로 있다.
          onStartElsewhere={() => setView({ kind: "search", initialKeyword: "" })}
          loading={view.kind === "loading"}
          onShowVisits={() => setView({ kind: "visits" })}
        />
      )}

      {/*
        검색 화면에서 장소를 고르면(pickSpot) 조회가 시작되지만, 그 조회는 시작
        화면이 아니라 검색 화면에서 비롯된 것이다. 위 StartScreen 조건으로 넘기면
        조회 중에 검색 화면이 사라지고 아무 단추도 살아있지 않은 시작 화면이
        잠깐 뜬다 — 사용자가 방금 고른 장소도, 방금 보던 목록도 사라진 것처럼
        보인다. 그래서 loading.from이 "search"인 동안은 이 화면을 계속 그리고,
        picking으로 넘겨 목록·단추를 잠근다.
      */}
      {(view.kind === "search" || (view.kind === "loading" && view.from === "search")) && (
        <SearchScreen
          initialKeyword={view.kind === "search" ? view.initialKeyword : ""}
          onPick={pickSpot}
          onBack={() => setView({ kind: "start" })}
          picking={view.kind === "loading"}
        />
      )}

      {view.kind === "candidates" && (
        <CandidateScreen
          whereLabel={anchorLabel(view.anchor)}
          // `바꾸기`는 기준 위치를 바꾸러 가는 것이지 지난 검색어로 다시 찾는 것이
          // 아니므로 비운다. onStartElsewhere와 같은 이유다.
          onChangeWhere={() => setView({ kind: "search", initialKeyword: "" })}
          candidates={view.candidates}
          onChoose={choose}
          onReshuffle={reshuffle}
          onDecideForMe={decideForMe}
        />
      )}

      {view.kind === "result" && (
        <ResultScreen
          whereLabel={anchorLabel(view.anchor)}
          // 위 CandidateScreen의 onChangeWhere와 같은 이유로 비운다.
          onChangeWhere={() => setView({ kind: "search", initialKeyword: "" })}
          onBackToCandidates={backToCandidates}
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
          undoneCount={undoable.length}
          onUndo={undoForget}
          // 화면을 벗어나면 되돌리기도 사라진다는 것이 이 설계의 전제다. 여기를
          // 빠뜨리면 다음에 기록 화면에 들어왔을 때 오래된 안내가 떠 있고,
          // 누르면 사용자가 잊은 항목이 되살아난다.
          onBack={() => {
            setUndoable([]);
            setView({ kind: "start" });
          }}
        />
      )}

      {view.kind === "empty" && (
        <Notice
          title="주변에서 음식점을 찾지 못했어요"
          description="범위를 넓혀서 다시 찾아볼까요?"
          // view.anchor를 넘긴다. 넘기지 않으면 경주를 찾던 사람이 집 주변으로 돌아간다.
          actions={[{ label: "다시 찾아보기", onClick: () => start(view.anchor, WIDER_RADIUS) }]}
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
          // view.anchor를 넘긴다. 넘기지 않으면(예전처럼 {kind:"here"}로 고정하면)
          // 옮긴 위치에서 조회하다 실패한 사람이 "다시 시도"를 눌러도 그 위치가
          // 아니라 사용자가 서 있는 자리로 조회하고, 위치 권한을 거부한 사람은
          // 그 순간 권한 요청 창까지 보게 된다(위 empty 화면의 "다시 찾아보기"와
          // 같은 함정).
          actions={
            notice.retryable
              ? [{ label: "다시 시도", onClick: () => start(view.anchor) }]
              : []
          }
        />
      )}
    </main>
  );
}
