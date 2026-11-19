/**
 * /stats 화면의 비밀번호 확인. Proxy(web/proxy.ts)와 페이지가 같은 함수를 쓴다.
 *
 * 왜 두 곳에서 확인하는가: Proxy는 경로 설정(matcher)이 어긋나면 조용히 빠질 수 있다.
 * 페이지가 한 번 더 확인하면 Proxy가 빠져도 통계가 열리지 않는다.
 *
 * node:crypto를 쓴다 — Next.js 16의 Proxy는 Node.js 런타임에서 돈다.
 */
import { createHash, timingSafeEqual } from "node:crypto";

/** 401 응답에 실어 브라우저가 비밀번호 입력창을 띄우게 하는 값. UTF-8은 한글 비밀번호를 위한 것이다. */
export const STATS_CHALLENGE = 'Basic realm="stats", charset="UTF-8"';

/** 양쪽을 같은 길이(32바이트)로 줄인다. 이렇게 해야 길이가 달라도 timingSafeEqual을 부를 수 있고, 길이가 응답 시간에 드러나지 않는다. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Authorization 헤더가 "Basic <base64(아무 이름:비밀번호)>"이고 비밀번호가 맞으면 true.
 * password가 ""이면 언제나 false다 — 환경변수를 빠뜨린 배포가 열린 채로 나가지 않게 한다.
 * 사용자 이름은 보지 않는다.
 */
export function checkBasicAuth(header: string | null, password: string): boolean {
  if (password === "" || header === null) {
    return false;
  }
  const match = /^Basic +(\S+)$/i.exec(header);
  if (match === null) {
    return false;
  }
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  // 이름에는 콜론이 못 들어가지만 비밀번호에는 들어갈 수 있다. 첫 콜론까지만 이름으로 본다.
  const colon = decoded.indexOf(":");
  if (colon === -1) {
    return false;
  }
  return timingSafeEqual(digest(decoded.slice(colon + 1)), digest(password));
}
