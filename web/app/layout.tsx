import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "./globals.css";

/*
  본문·제목·버튼 모두 이 글꼴 하나를 쓴다(결정 근거와 측정값은 globals.css의 글꼴 주석).
  subsets가 ["latin"]뿐인 까닭: 한글 조각은 글자 범위별로 잘게 나뉘어 화면에 나온 글자가
  속한 조각만 내려받는다. "korean"은 이 글꼴의 subsets 목록에 없다.
  가변 글꼴(weight 생략)이라 굵기를 몇 단계로 써도 파일이 늘지 않는다.
  display: "swap"이어도 next/font가 폭을 맞춘 임시 글꼴을 함께 내보내므로, 글꼴이 늦게
  도착해도 줄바꿈이 크게 바뀌지 않는다(느린 4G 수준 회선에서 측정, 흔들림 0.0081).
*/
const bodyFont = Noto_Serif_KR({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "오늘은 뭐 먹지?",
  description: "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.",
};

/*
  colorScheme: 브라우저가 스크롤바·기본 위젯을 화면 밝기에 맞춰 그리게 한다.
  적지 않으면 어두운 화면에서 흰 스크롤바가 종이색 바탕 옆에 그대로 남는다.

  themeColor: 휴대폰 브라우저의 주소 표시줄 색이다. 화면 바탕과 같은 값을 주어
  화면이 표시줄 아래에서 잘려 보이지 않게 한다. globals.css의 --wood-color와 같은 값이라
  한쪽만 고치면 어긋난다 — 색을 바꿀 때는 두 곳을 같이 본다.
*/
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8d6b4" },
    { media: "(prefers-color-scheme: dark)", color: "#2c2118" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${bodyFont.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
