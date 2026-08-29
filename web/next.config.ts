import type { NextConfig } from "next";

// 브라우저는 자기 주소의 /api로만 요청하고, Next.js가 그 요청을 Go 서버로 넘긴다.
// 이렇게 하면 브라우저 입장에서 같은 출처라 교차 출처 허용 설정이 필요 없다.
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";

// 이 값은 빌드할 때 굳는다. 배포 빌드에서 비어 있으면 배포본의 모든 /api 요청이
// 개발용 주소로 나가 전부 실패하는데, 화면에는 아무 단서도 남지 않는다.
if (!process.env.API_ORIGIN && process.env.NODE_ENV === "production") {
  console.warn(
    "[random-choice] API_ORIGIN이 설정되지 않아 http://localhost:8080 으로 빌드합니다. " +
      "배포본에서는 브라우저의 /api 요청이 전부 실패합니다.",
  );
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
