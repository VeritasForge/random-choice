"use client";

import { useState } from "react";
import CandidateScreen from "@/components/CandidateScreen";
import Notice from "@/components/Notice";
import ResultScreen from "@/components/ResultScreen";
import StartScreen from "@/components/StartScreen";
import { fetchNearby, NearbyError, type NearbyResult } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";
import { pickAvoiding, pickDistinct, pickOne } from "@/lib/pick";

const CANDIDATE_COUNT = 4;
const DEFAULT_RADIUS = 500;
const WIDER_RADII = [1000, 2000];

/**
 * 지금 무엇을 보여줄지를 하나의 값으로 관리한다.
 * 결과와 후보를 이 값 안에 함께 담아 두어, 화면 상태와 데이터가 어긋나지 않게 한다.
 * 여기 담긴 목록은 새로고침하면 사라진다. 어디에도 저장하지 않는다 —
 * 카카오가 결과 저장을 금지하기 때문이다.
 */
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "candidates"; result: NearbyResult; candidates: string[] }
  | { kind: "result"; result: NearbyResult; cuisine: string }
  | { kind: "empty"; radius: number }
  | { kind: "error"; code: string; message: string };

const ERROR_TEXT: Record<string, { title: string; description: string }> = {
  permission_denied: {
    title: "위치를 알아야 주변 음식점을 찾을 수 있어요",
    description:
      "브라우저 주소창 왼쪽의 자물쇠 아이콘을 눌러 위치 권한을 허용한 뒤, 다시 시도해 주세요.",
  },
  position_unavailable: {
    title: "지금 위치를 확인하지 못했어요",
    description: "실내이거나 신호가 약할 때 생길 수 있습니다. 잠시 후 다시 시도해 주세요.",
  },
  unsupported: {
    title: "이 브라우저는 위치 기능을 지원하지 않아요",
    description: "크롬이나 사파리 같은 최신 브라우저에서 다시 열어 주세요.",
  },
  not_configured: {
    title: "서버 준비가 아직 안 됐어요",
    description: "장소 조회에 필요한 열쇠가 서버에 설정되지 않았습니다.",
  },
  quota_exceeded: {
    title: "오늘 조회 한도를 다 썼어요",
    description: "내일 다시 이용해 주세요.",
  },
  upstream_error: {
    title: "장소 정보를 가져오지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  network_error: {
    title: "서버에 연결하지 못했어요",
    description: "인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
  },
};

const FALLBACK_ERROR = {
  title: "문제가 생겼어요",
  description: "잠시 후 다시 시도해 주세요.",
};

export default function Home() {
  const [view, setView] = useState<View>({ kind: "start" });

  async function start(radius: number) {
    setView({ kind: "loading" });

    try {
      const coords = await getCurrentPosition();
      const result = await fetchNearby(coords.lat, coords.lng, radius);
      const names = result.cuisines.map((cuisine) => cuisine.name);
      if (names.length === 0) {
        setView({ kind: "empty", radius });
        return;
      }
      setView({
        kind: "candidates",
        result,
        candidates: pickDistinct(names, CANDIDATE_COUNT, Math.random),
      });
    } catch (error) {
      // 서버가 준 오류는 코드를 그대로 쓰고,
      // 위치 확인 실패는 Error의 message에 이유가 담겨 온다.
      if (error instanceof NearbyError) {
        setView({ kind: "error", code: error.code, message: error.message });
        return;
      }
      const code = error instanceof Error ? error.message : "position_unavailable";
      setView({ kind: "error", code, message: "" });
    }
  }

  function reshuffle() {
    if (view.kind !== "candidates") return;
    const names = view.result.cuisines.map((cuisine) => cuisine.name);
    setView({
      ...view,
      candidates: pickAvoiding(names, CANDIDATE_COUNT, view.candidates, Math.random),
    });
  }

  function choose(cuisine: string) {
    if (view.kind !== "candidates") return;
    setView({ kind: "result", result: view.result, cuisine });
  }

  function decideForMe() {
    if (view.kind !== "candidates") return;
    const chosen = pickOne(view.candidates, Math.random);
    if (chosen) choose(chosen);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 p-6">
      {view.kind === "start" && <StartScreen onStart={() => start(DEFAULT_RADIUS)} loading={false} />}

      {view.kind === "loading" && <StartScreen onStart={() => {}} loading />}

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
          places={view.result.places.filter((place) => place.cuisine === view.cuisine)}
          onRestart={() => setView({ kind: "start" })}
        />
      )}

      {view.kind === "empty" && (
        <Notice
          title={`반경 ${view.radius}m 안에 음식점이 없어요`}
          description="조금 더 넓게 찾아볼까요?"
          actions={WIDER_RADII.map((radius) => ({
            label: `${radius / 1000}km로 넓히기`,
            onClick: () => start(radius),
          }))}
        />
      )}

      {view.kind === "error" && (
        <Notice
          title={(ERROR_TEXT[view.code] ?? FALLBACK_ERROR).title}
          description={view.message || (ERROR_TEXT[view.code] ?? FALLBACK_ERROR).description}
          actions={[{ label: "다시 시도", onClick: () => start(DEFAULT_RADIUS) }]}
        />
      )}
    </main>
  );
}
