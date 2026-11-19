"use client";

import { useEffect } from "react";
import { markStatsOwner } from "@/lib/visitor";
import { browserStore } from "@/lib/visits";

/**
 * 통계 화면을 연 브라우저에 "운영자" 표시를 남기는, 아무것도 그리지 않는 컴포넌트.
 * 이 브라우저의 방문이 접속 통계에 섞이지 않게 하려는 것이다. 페이지가 인증을 통과했을 때만 그린다.
 */
export default function StatsOwnerMark() {
  useEffect(() => {
    markStatsOwner(browserStore());
  }, []);

  return null;
}
