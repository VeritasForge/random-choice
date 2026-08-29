export type Cuisine = { name: string; count: number };

export type Place = {
  id: string;
  name: string;
  cuisine: string;
  distance: number;
  roadAddress: string;
  phone: string;
  placeUrl: string;
  lat: number;
  lng: number;
};

export type NearbyResult = { cuisines: Cuisine[]; places: Place[] };

/**
 * 조회 실패를 코드와 함께 전달한다.
 * code는 서버가 준 것(quota_exceeded·upstream_error 등)일 수도 있고,
 * 이 파일이 붙인 것(network_error·timeout·malformed_response)일 수도 있다.
 * 화면은 code를 보고 어떤 안내 문구를 보여줄지 정한다.
 *
 * status는 서버가 응답은 했으나 오류였을 때의 HTTP 상태 코드다.
 * 서버에 닿지도 못한 경우에는 undefined다 — 프록시가 죽은 것인지
 * 서버가 죽은 것인지를 나중에 구분할 수 있어야 하기 때문에 버리지 않는다.
 */
export class NearbyError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "NearbyError";
    this.code = code;
    this.status = status;
  }
}

/**
 * 서버 호출을 포기하는 시간.
 * 서버는 카카오를 5초짜리로 최대 3번 순차 호출하므로 최악 15초가 걸린다.
 * 그보다 넉넉히 잡되, 무한정 기다리지는 않는다 — 기다리기만 하면
 * 화면은 "주변을 살펴보는 중…"에 갇히고 사용자는 빠져나올 방법이 없다.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/** 받은 값이 NearbyResult의 모양을 갖췄는지 확인한다. */
function isNearbyResult(value: unknown): value is NearbyResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { cuisines?: unknown; places?: unknown };
  return Array.isArray(candidate.cuisines) && Array.isArray(candidate.places);
}

/** 주변 음식점과 음식 종류를 서버에 물어본다. */
export async function fetchNearby(
  lat: number,
  lng: number,
  radius: number,
): Promise<NearbyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`/api/v1/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, {
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new NearbyError("timeout", "서버가 제때 응답하지 않았습니다.");
    }
    throw new NearbyError("network_error", "서버에 연결하지 못했습니다.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (body === null) {
      // 서버가 우리 오류 형식이 아닌 것을 돌려줬다. 프록시가 목적지에 못 닿았을 때
      // 흔한 모습이라, 상태 코드만이라도 남겨 두어야 나중에 원인을 좁힐 수 있다.
      console.error("[fetchNearby] 오류 본문을 해석하지 못했습니다", response.status);
    }
    const parsed = body as { error?: unknown; message?: unknown } | null;
    const code = typeof parsed?.error === "string" ? parsed.error : "unknown_error";
    const message =
      typeof parsed?.message === "string"
        ? parsed.message
        : "알 수 없는 오류가 발생했습니다.";
    throw new NearbyError(code, message, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new NearbyError("malformed_response", "서버 응답을 이해하지 못했습니다.", response.status);
  }

  // 모양을 확인하지 않고 단정하면, 계약이 어긋난 순간이 아니라 한참 뒤
  // 화면이 그 값을 쓰는 자리에서 TypeError로 터진다. 실패는 발생 지점에서 멈춰야 한다.
  if (!isNearbyResult(body)) {
    throw new NearbyError(
      "malformed_response",
      "서버 응답 형식이 예상과 다릅니다.",
      response.status,
    );
  }
  return body;
}
