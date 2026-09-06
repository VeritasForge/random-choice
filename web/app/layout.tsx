import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘 점심 뭐 먹지",
  description: "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.",
};

/*
  colorScheme: 브라우저가 스크롤바·기본 위젯을 화면 밝기에 맞춰 그리게 한다.
  적지 않으면 어두운 화면에서 흰 스크롤바가 종이색 바탕 옆에 그대로 남는다.

  themeColor: 휴대폰 브라우저의 주소 표시줄 색이다. 화면 바탕과 같은 값을 주어
  화면이 표시줄 아래에서 잘려 보이지 않게 한다. globals.css의 --background와 같은 값이라
  한쪽만 고치면 어긋난다 — 색을 바꿀 때는 두 곳을 같이 본다.
*/
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
