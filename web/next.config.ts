import type { NextConfig } from "next";

// 브라우저는 자기 주소의 /api로만 요청하고, 라우트 핸들러(app/api/v1/nearby/route.ts)가
// 그 요청을 Go 서버로 넘긴다. 브라우저 입장에서는 같은 출처라 교차 출처 허용 설정이
// 필요 없고, 중계가 서버에서 일어나므로 Go 서버에 붙이는 비밀 헤더가 브라우저에 보이지 않는다.
//
// 예전에는 이 파일의 rewrites가 그 중계를 했다. 그 방식으로는 요청 헤더를 붙일 수 없어
// (rewrites의 has·missing은 조건을 검사하는 필드이고 헤더를 설정하지 못한다)
// 라우트 핸들러로 옮겼다.

// 조회가 나갈 주소를 정하는 값이라, 없으면 배포본의 모든 조회가 개발용 주소로 나가
// 전부 실패한다. 화면에는 아무 단서도 남지 않으므로 여기서 알린다.
//
// 이 경고는 빌드할 때(next build) 뜬다. next start로 켤 때도 이 파일은 읽히지만,
// 그때는 NODE_ENV가 production으로 설정된 환경에서만 뜬다 — Next.js가 이 파일을 읽는
// 시점에 그 값을 스스로 채워 두지는 않는다(로컬에서 두 경우를 각각 켜 확인했다).
if (!process.env.API_ORIGIN && process.env.NODE_ENV === "production") {
  console.warn(
    "[random-choice] API_ORIGIN이 설정되지 않았습니다. 조회 요청이 http://localhost:8080 으로 " +
      "나가므로, 배포본에서는 브라우저의 /api 요청이 전부 실패합니다.",
  );
}

const nextConfig: NextConfig = {};

export default nextConfig;
