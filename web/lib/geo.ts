export type Coords = { lat: number; lng: number };

/**
 * 브라우저에게 현재 위치를 묻는다.
 * 실패하면 Error를 던지고, message에 이유를 담는다:
 * unsupported(위치 기능 자체가 없음) · permission_denied(사용자가 거부) ·
 * position_unavailable(그 밖의 실패). 화면은 이 값으로 안내 문구를 고른다.
 */
export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "permission_denied"
              : "position_unavailable",
          ),
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  });
}
