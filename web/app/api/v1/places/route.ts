import { proxyToApi } from "@/lib/proxy";

/**
 * 브라우저의 장소 검색 요청을 Go 서버로 넘긴다.
 *
 * 이 파일은 껍데기다 — 환경변수를 읽어 넘기는 것 말고는 아무 판단도 하지 않는다.
 * 화면 시험은 브라우저 없이 node에서 돌아 app/ 아래를 실행하지 못하므로,
 * 여기에 판단을 두면 어떤 시험도 그것을 지키지 못한다(규칙과 시험은 lib/proxy.ts에 있다).
 *
 * 이 경로에 export const dynamic을 두지 않는 이유는 nearby/route.ts와 같다 —
 * 라우트 핸들러는 기본적으로 캐시되지 않는다.
 */
export async function GET(request: Request) {
  // 브라우저가 보낸 질의 문자열을 그대로 넘긴다. 값 검사는 Go 서버가 한다 —
  // 여기서 한 번 더 검사하면 두 곳의 규칙이 조용히 어긋난다.
  const search = new URL(request.url).search;

  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";
  const internalKey = process.env.INTERNAL_API_KEY ?? "";

  return proxyToApi("/api/v1/places", search, apiOrigin, internalKey, fetch);
}
