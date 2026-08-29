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
 * 요청 한 건 전체를 포기하는 시간. 헤더가 아니라 본문을 다 읽을 때까지가 대상이다.
 *
 * 서버는 카카오 조회 전체를 12초로 자른다(api/internal/kakao/client.go의 searchTimeout).
 * 그보다 넉넉히 잡되 무한정 기다리지는 않는다 — 기다리기만 하면 화면은
 * "주변을 살펴보는 중…"에 갇히고, 그 화면의 버튼은 로딩 중 눌리지 않으므로
 * 사용자는 새로고침 말고는 빠져나올 방법이 없다.
 * 서버 쪽 상한을 바꾸면 이 값도 함께 봐야 한다.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

function isCuisine(value: unknown): value is Cuisine {
  return typeof value === "object" && value !== null && typeof (value as Cuisine).name === "string";
}

function isPlace(value: unknown): value is Place {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Place;
  return typeof candidate.id === "string" && typeof candidate.cuisine === "string";
}

/**
 * 받은 값이 NearbyResult의 모양을 갖췄는지 확인한다.
 *
 * 원소까지 보는 이유: 배열 두 개만 확인하면 `{"cuisines":["한식"],"places":[]}` 같은
 * 값이 통과한다. 그러면 화면이 이름을 읽을 때 undefined가 나오는데, 그것이 후보 하나로
 * 세어져 글자 없는 버튼이 뜨고, 눌러도 해당하는 가게가 없는 화면으로 끝난다.
 * 오류도 흔적도 남지 않는 무증상 오작동이라, 여기서 막는 편이 훨씬 낫다.
 * 한 조회 상한이 45곳이라 원소를 전부 훑어도 비용은 없다.
 */
function isNearbyResult(value: unknown): value is NearbyResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { cuisines?: unknown; places?: unknown };
  return (
    Array.isArray(candidate.cuisines) &&
    candidate.cuisines.every(isCuisine) &&
    Array.isArray(candidate.places) &&
    candidate.places.every(isPlace)
  );
}

/** 주변 음식점과 음식 종류를 서버에 물어본다. */
export async function fetchNearby(
  lat: number,
  lng: number,
  radius: number,
): Promise<NearbyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // 타이머 해제를 함수 전체의 finally에 둔다. fetch만 감싸면 헤더가 도착하는 순간
  // 상한이 풀려, 본문 스트림이 멈췄을 때 아래 response.json()이 영영 끝나지 않는다.
  try {
    let response: Response;
    try {
      response = await fetch(`/api/v1/nearby?lat=${lat}&lng=${lng}&radius=${radius}`, {
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new NearbyError("timeout", "서버가 제때 응답하지 않았습니다.");
      }
      // 원인을 남기지 않으면 통신 실패와 우리 코드의 오류가 구분되지 않는다.
      console.error("[fetchNearby] 요청이 실패했습니다", cause);
      throw new NearbyError("network_error", "서버에 연결하지 못했습니다.");
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
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new NearbyError("timeout", "서버가 제때 응답하지 않았습니다.", response.status);
      }
      console.error("[fetchNearby] 응답 본문을 해석하지 못했습니다", response.status, cause);
      throw new NearbyError(
        "malformed_response",
        "서버 응답을 이해하지 못했습니다.",
        response.status,
      );
    }

    // 모양을 확인하지 않고 단정하면, 계약이 어긋난 순간이 아니라 한참 뒤
    // 화면이 그 값을 쓰는 자리에서 터지거나 조용히 빈 화면이 된다. 실패는 발생 지점에서 멈춰야 한다.
    if (!isNearbyResult(body)) {
      console.error("[fetchNearby] 응답 형식이 예상과 다릅니다", response.status, body);
      throw new NearbyError(
        "malformed_response",
        "서버 응답 형식이 예상과 다릅니다.",
        response.status,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
