import type { MetadataRoute } from "next";

/*
  홈 화면에 추가할 때 브라우저가 읽는 앱 정보다. Next.js가 이 파일을 /manifest.webmanifest로
  내보내고 <link rel="manifest">를 스스로 넣는다.

  **이름과 아이콘은 가볍게 바꾸지 않는다.** 둘은 사용자가 홈 화면에 추가하는 순간 그 기기에
  굳는다. 나중에 여기를 고쳐도 이미 추가한 사람의 기기에는 잘 반영되지 않고, 아이폰은
  지우고 다시 추가해야 바뀐다.

  short_name을 줄이지 않은 것은 정한 일이다. 아이콘 아래 칸이 좁아 일부 기기에서 끝이
  "…"으로 잘릴 수 있다는 것을 알고도 서비스 이름을 그대로 두기로 했다
  (docs/superpowers/specs/2026-11-19-home-screen-install-design.md 6-5절).

  background_color는 앱이 켜지는 동안의 바탕이고 theme_color는 위쪽 상태 표시줄의 색이다.
  둘 다 app/globals.css의 --wood-color, app/layout.tsx의 themeColor(밝은 쪽)와 같은 값이라
  색을 바꿀 때는 세 곳을 같이 본다. 이 파일은 어두운 화면용 값을 따로 둘 수 없어 밝은 쪽만 적는다.

  서비스 워커는 두지 않는다. 이 서비스는 가게 정보를 카카오에서 실시간으로만 받을 수 있어
  인터넷 없이 할 수 있는 일이 없고, 기기에 파일을 담아 두기 시작하면 카카오 조회 응답까지
  담길 위험이 생긴다(같은 설계 문서 5절).
*/
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "오늘은 뭐 먹지?",
    short_name: "오늘은 뭐 먹지?",
    // app/layout.tsx의 metadata.description과 같은 문장이다.
    description: "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#e8d6b4",
    theme_color: "#e8d6b4",
    // 그림 파일은 scripts/make-icons.mjs가 assets/의 원본에서 만든다.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // 안드로이드가 원이나 둥근 네모로 잘라 쓰는 판. 그림을 가운데로 모아 두었다.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
