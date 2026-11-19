import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth, STATS_CHALLENGE } from "@/lib/statsAuth";

/**
 * /stats를 비밀번호(HTTP Basic)로 막는 Next.js Proxy. lib/proxy.ts(Go 서버 중계)와는 다른 파일이다.
 * 판단은 lib/statsAuth.ts에 있고, 여기는 결과를 응답으로 옮기기만 한다.
 * STATS_PASSWORD가 비어 있으면 아무도 들어오지 못한다.
 */
export function proxy(request: NextRequest) {
  if (!checkBasicAuth(request.headers.get("authorization"), process.env.STATS_PASSWORD ?? "")) {
    return new NextResponse(null, { status: 401, headers: { "WWW-Authenticate": STATS_CHALLENGE } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/stats"] };
