"use client";

import { useEffect } from "react";
import { claimVisit, sendVisit, sessionStore } from "@/lib/visitor";
import { browserStore } from "@/lib/visits";

/**
 * 방문을 서버로 보내는, 아무것도 그리지 않는 컴포넌트.
 *
 * 판단은 전부 lib/visitor.ts의 claimVisit이 한다 — 여기는 "열렸을 때"와 "다시 보일 때"에
 * 그것을 부르는 껍데기다. 탭을 오래 열어 둔 채 돌아온 사람도 30분이 지났으면
 * 새 방문으로 세려고 visibilitychange도 듣는다. 보내는 것은 기다리지 않는다 —
 * 화면이 방문 기록 때문에 느려지면 안 된다.
 */
export default function VisitBeacon() {
  useEffect(() => {
    function check() {
      const id = claimVisit(browserStore(), sessionStore(), Date.now(), () => crypto.randomUUID());
      if (id !== null) {
        void sendVisit(id, fetch);
      }
    }

    check();
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return null;
}
