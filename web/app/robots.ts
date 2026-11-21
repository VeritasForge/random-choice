import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

/*
  검색엔진에 "어디를 가져가도 되는가"를 알리는 파일이다. Next.js가 이 파일을 /robots.txt로
  내보낸다.

  막는 것은 /api/ 하나다. 그 아래는 화면이 아니라 조회 응답이라 검색 결과에 올릴 것이 없다.

  **운영자용 통계 화면(/stats)은 일부러 적지 않는다.** 이유는 둘이다
  (docs/superpowers/specs/2026-11-21-search-basics-design.md 6-3절).
  - 그 화면을 검색에서 지켜 주는 것은 비밀번호다. 비밀번호가 없는 요청은 화면 내용을 받지
    못하므로(proxy.ts가 401로 답한다) 검색엔진이 가져갈 것이 없다.
  - 이 파일은 누구나 읽을 수 있어서, 여기에 적으면 운영자용 화면의 주소를 알리는 셈이 된다.

  미리보기 배포를 따로 막지 않는 것은 Vercel이 그쪽에 검색 제외 헤더를 스스로 붙이기 때문이다.
*/
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
