/**
 * 브라우저가 "방문 한 번"을 언제 서버로 보낼지 정하고, 보낸다.
 *
 * 보내는 것은 이 브라우저가 스스로 만든 익명 ID 하나뿐이다. 위치·검색어·카카오에서
 * 받은 것은 어떤 것도 실리지 않는다(설계 문서 9절의 저장 금지와 무관하게 두려는 것이다).
 *
 *   브라우저 ──POST /api/v1/visits──▶ 화면 서버 ──X-Internal-Key──▶ Go 서버
 *
 * 판단(claimVisit)을 컴포넌트가 아니라 여기 두는 이유: 화면 시험은 브라우저 없이
 * node에서 돌아 .tsx를 그리지 못한다. 그래서 컴포넌트(VisitBeacon)는 이 함수를
 * 부르기만 하는 껍데기로 남긴다. 저장소를 인자로 받는 것도 같은 이유다(visits.ts의 Store).
 *
 * **통계 방해 금지가 이 파일의 제약이다.** 방문 보내기가 화면을 느리게 하거나 오류
 * 안내를 띄우면 안 되므로, 저장소 예외·네트워크 오류·2xx가 아닌 응답은 전부 삼킨다.
 */
import type { Store } from "./visits";

/** 이 브라우저의 익명 ID. localStorage에 두어 탭·재방문에 걸쳐 같은 값이 된다. */
export const VISITOR_ID_KEY = "random-choice.visitor-id.v1";

/**
 * /stats 화면에 들어온 적 있는 브라우저의 표시(값은 "1").
 * 통계를 보는 주인의 접속이 통계에 섞이면 숫자가 부풀기 때문에, 표시가 있으면 방문을 보내지 않는다.
 */
export const STATS_OWNER_KEY = "random-choice.stats-owner.v1";

/**
 * 마지막으로 방문을 보낸 시각(ms). **sessionStorage**에 둔다 — 탭마다 따로여야 새 탭이
 * 새 방문으로 세어지고, 탭을 닫으면 저절로 잊혀 다음에 열면 다시 센다.
 */
export const VISIT_SENT_KEY = "random-choice.visit-sent.v1";

/** 같은 탭에서 이 시간 안에 다시 보이는 것은 같은 방문으로 본다(새로 고침·탭 전환). */
export const VISIT_GAP_MS = 30 * 60 * 1000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 지금 방문을 보내야 하면 익명 ID를, 아니면 null을 돌려준다. 보내야 하면 보낸 시각도 여기서 적는다.
 *
 * 시각을 여기서 적는 이유: "보낼지 판단"과 "보냈다고 적기"를 나누면 그 사이에
 * 두 번째 호출(마운트 직후 visibilitychange 등)이 끼어 같은 방문을 두 번 보낸다.
 * 한 동기 함수 안에서 끝내면 끼어들 틈이 없다.
 *
 * 저장소가 막힌 브라우저(null)나 읽고 쓰다 던지는 브라우저는 보내지 않는다. ID를
 * 기억하지 못하면 매번 새 사람으로 세어져 숫자가 부풀기 때문이다.
 */
export function claimVisit(
  local: Store | null,
  session: Store | null,
  now: number,
  newId: () => string,
): string | null {
  if (local === null || session === null) {
    return null;
  }
  try {
    if (local.getItem(STATS_OWNER_KEY) !== null) {
      return null;
    }

    const raw = session.getItem(VISIT_SENT_KEY);
    if (raw !== null) {
      const last = Number(raw);
      // 미래 시각이나 숫자가 아닌 값(손으로 고쳤거나 시계가 되감긴 경우)은 없는 것으로 본다.
      // 그대로 믿으면 "아직 30분이 안 지났다"가 오래 이어져 이 탭의 방문이 세어지지 않는다.
      if (Number.isFinite(last) && last <= now && now - last < VISIT_GAP_MS) {
        return null;
      }
    }

    let id = local.getItem(VISITOR_ID_KEY);
    if (id === null || !UUID_PATTERN.test(id)) {
      id = newId();
      local.setItem(VISITOR_ID_KEY, id);
    }
    session.setItem(VISIT_SENT_KEY, String(now));
    return id;
  } catch {
    // 저장소가 막혔거나 가득 찼다. 사용자가 할 일이 없으므로 조용히 보내지 않는다.
    return null;
  }
}

/** /stats에 들어온 브라우저에 표시를 남긴다. 실패해도 던지지 않는다. */
export function markStatsOwner(local: Store | null): void {
  if (local === null) {
    return;
  }
  try {
    local.setItem(STATS_OWNER_KEY, "1");
  } catch {
    // 표시를 못 남겼다. 이 브라우저의 방문이 몇 번 더 세어질 뿐이다.
  }
}

/**
 * 방문을 보낸다. 어떤 실패도 던지지 않고, 응답은 읽지 않는다.
 *
 * keepalive: 탭을 닫거나 다른 페이지로 옮겨 가는 도중에도 요청이 끝까지 가게 한다.
 * 로컬에는 데이터베이스가 없어 서버가 503을 주는 것이 정상인데, 그것도 화면에는 아무 영향이 없어야 한다.
 */
export async function sendVisit(visitorId: string, fetcher: typeof fetch): Promise<void> {
  try {
    await fetcher("/api/v1/visits", {
      method: "POST",
      body: JSON.stringify({ visitorId }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
  } catch {
    // 네트워크 오류. 방문 한 번이 세어지지 않을 뿐이다.
  }
}

/** sessionStorage를 안전하게 얻는다. 접근 자체가 예외를 던지면 null이다(browserStore와 같은 방식). */
export function sessionStore(): Store | null {
  try {
    if (typeof sessionStorage === "undefined") {
      return null;
    }
    // 접근만으로 예외를 던지는 설정이 있으므로 한 번 만져 본다.
    sessionStorage.getItem(VISIT_SENT_KEY);
    return sessionStorage;
  } catch {
    return null;
  }
}
