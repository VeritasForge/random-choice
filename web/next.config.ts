import type { NextConfig } from "next";

// 브라우저는 자기 주소의 /api로만 요청하고, Next.js가 그 요청을 Go 서버로 넘긴다.
// 이렇게 하면 브라우저 입장에서 같은 출처라 교차 출처 허용 설정이 필요 없다.
const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
