export type Coords = { lat: number; lng: number };

/** 위치 확인이 실패한 이유. 화면은 이 값으로 안내 문구를 고른다. */
export type GeoErrorCode =
  | "unsupported"
  | "permission_denied"
  | "position_unavailable";

/**
 * 위치 확인 실패를 코드와 함께 전달한다.
 *
 * 이유를 Error의 message가 아니라 전용 필드에 담는 이유:
 * message에 담으면 부르는 쪽이 "Error면 message가 곧 코드"라고 가정하게 되는데,
 * 그러면 이 흐름 안에서 생긴 무관한 예외(예: TypeError)의 message까지
 * 위치 실패 코드로 오인된다. 전용 타입이면 instanceof로 정확히 갈라진다.
 */
export class GeoError extends Error {
  readonly code: GeoErrorCode;

  constructor(code: GeoErrorCode, message: string) {
    super(message);
    this.name = "GeoError";
    this.code = code;
  }
}

/** 위치를 기다리는 최대 시간. 없으면 브라우저 기본값이 무한대라 영영 안 돌아온다. */
export const POSITION_TIMEOUT_MS = 10_000;

/**
 * 브라우저에게 현재 위치를 묻는다.
 * 실패하면 GeoError를 던지고, code에 이유를 담는다:
 * unsupported(위치 기능 자체가 없음) · permission_denied(사용자가 거부) ·
 * position_unavailable(그 밖의 실패 — 시간 초과 포함).
 */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new GeoError("unsupported", "이 브라우저는 위치 기능을 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) =>
        reject(
          error.code === error.PERMISSION_DENIED
            ? new GeoError("permission_denied", "위치 권한이 거부되었습니다.")
            : new GeoError("position_unavailable", "현재 위치를 확인하지 못했습니다."),
        ),
      { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
