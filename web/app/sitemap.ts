import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

/*
  검색엔진에 알리는 페이지 목록이다. Next.js가 이 파일을 /sitemap.xml로 내보낸다.

  공개 페이지는 시작 화면 하나다. 나머지 화면은 같은 주소 안에서 바뀌고, /stats는 운영자용이다.

  lastModified는 넣지 않는다. 빌드할 때마다 바뀌는 값을 넣으면 내용이 그대로인데도
  바뀐 것처럼 알리게 된다.
*/
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl()}/` }];
}
