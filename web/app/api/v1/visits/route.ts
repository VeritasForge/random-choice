import { proxyToApi } from "@/lib/proxy";

/**
 * 브라우저의 방문 기록 요청을 Go 서버로 넘긴다.
 *
 * nearby/route.ts와 같은 껍데기다 — 본문을 읽어 proxyToApi에 넘기는 것 말고는 아무 판단도
 * 하지 않는다(화면 시험이 app/ 아래를 실행하지 못하는 까닭은 그 파일에 적어 두었다).
 * 본문 검사(UUID 꼴인지)는 Go 서버가 한다. 여기서 한 번 더 하면 두 곳의 규칙이 어긋난다.
 *
 * 캐시: POST 라우트 핸들러는 캐시되지 않는다. 응답에는 proxyToApi가 no-store를 붙인다.
 */
export async function POST(request: Request) {
  const body = await request.text();

  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";
  const internalKey = process.env.INTERNAL_API_KEY ?? "";

  return proxyToApi("/api/v1/visits", "", apiOrigin, internalKey, fetch, { method: "POST", body });
}
