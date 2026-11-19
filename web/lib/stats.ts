/**
 * /stats 화면의 판단 모음. 화면(app/stats/page.tsx)은 이 파일의 결과를 그리기만 한다 —
 * 화면 시험은 node에서 돌아 app/을 실행하지 못하므로 판단을 여기 둔다(lib/proxy.ts와 같은 이유).
 */
import { INTERNAL_KEY_HEADER, type Fetcher } from "./proxy";

export type Unit = "day" | "week" | "month";
export type Bucket = { start: string; visitors: number; visits: number };
export type StatsResult = { ok: true; buckets: Bucket[] } | { ok: false; status: number };

/** 주소의 unit 값을 읽는다. 셋 중 하나가 아니면(없음·배열·엉뚱한 값) "day". */
export function parseUnit(value: unknown): Unit {
  return value === "week" || value === "month" ? value : "day";
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 칸의 시작 날짜(YYYY-MM-DD, 한국 시간 기준으로 API가 계산한 값)를 표 머리글로 바꾼다.
 * 요일은 문자열을 세계시 자정으로 읽어 구한다 — 서버 시간대에 따라 하루가 밀리지 않게.
 */
export function bucketLabel(start: string, unit: Unit): string {
  if (unit === "month") {
    return start.slice(0, 7);
  }
  const [year, month, day] = start.split("-").map(Number);
  const md = `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
  if (unit === "week") {
    return `${md} 주`;
  }
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${md} (${weekday})`;
}

/** 가장 큰 값 이상인 가장 작은 눈금 끝(1, 2, 5, 10, 20, 50, 100, …). 비었거나 전부 0이면 1. */
export function axisMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max <= 1) {
    return 1;
  }
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const step of [1, 2, 5]) {
      if (step * magnitude >= max) {
        return step * magnitude;
      }
    }
  }
}

function isBucket(value: unknown): value is Bucket {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const b = value as Record<string, unknown>;
  return typeof b.start === "string" && typeof b.visitors === "number" && typeof b.visits === "number";
}

/**
 * Go 서버에서 통계를 가져온다(서버끼리 호출이라 비밀 헤더를 직접 붙인다). 어떤 실패도 던지지 않는다.
 * status 0은 서버에 닿지 못함, 200은 응답이 약속한 모양이 아님이다.
 */
export async function fetchStats(
  unit: Unit,
  apiOrigin: string,
  internalKey: string,
  fetcher: Fetcher,
): Promise<StatsResult> {
  const headers: Record<string, string> = {};
  if (internalKey !== "") {
    headers[INTERNAL_KEY_HEADER] = internalKey;
  }
  let response: Response;
  try {
    response = await fetcher(`${apiOrigin}/api/v1/stats?unit=${unit}`, { headers, cache: "no-store" });
  } catch {
    return { ok: false, status: 0 };
  }
  if (response.status !== 200) {
    return { ok: false, status: response.status };
  }
  try {
    const body: unknown = await response.json();
    const buckets = (body as { buckets?: unknown } | null)?.buckets;
    if (Array.isArray(buckets) && buckets.every(isBucket)) {
      return { ok: true, buckets };
    }
  } catch {
    // 본문이 JSON이 아니다. 아래에서 같은 실패로 돌려준다.
  }
  return { ok: false, status: 200 };
}
