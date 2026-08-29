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
 * 서버가 돌려준 오류를 코드와 함께 전달한다.
 * 화면은 code를 보고 어떤 안내 문구를 보여줄지 정한다.
 */
export class NearbyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NearbyError";
    this.code = code;
  }
}

/** 주변 음식점과 음식 종류를 서버에 물어본다. */
export async function fetchNearby(
  lat: number,
  lng: number,
  radius: number,
): Promise<NearbyResult> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  } catch {
    throw new NearbyError("network_error", "서버에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = body as { error?: unknown; message?: unknown } | null;
    const code = typeof parsed?.error === "string" ? parsed.error : "unknown_error";
    const message =
      typeof parsed?.message === "string"
        ? parsed.message
        : "알 수 없는 오류가 발생했습니다.";
    throw new NearbyError(code, message);
  }

  return (await response.json()) as NearbyResult;
}
