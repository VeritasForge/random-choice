import type { Metadata } from "next";

/*
  검색엔진과 메신저에 이 서비스를 소개하는 정보를 한곳에서 만든다.

  **정식 주소를 읽는 곳은 이 파일 하나다.** 대표 주소·사이트맵·robots.txt·링크 미리보기가
  모두 siteUrl()에서 주소를 얻는다. 자체 도메인으로 옮길 때는 코드를 고치지 않고 환경변수
  SITE_URL의 값만 바꾼다(그 밖에 할 일은 README의 "검색엔진에 등록하기"에 있다).

  app/layout.tsx가 아니라 여기에 둔 까닭: layout.tsx는 글꼴을 불러와서 시험에서 읽을 수 없다.
*/

type Env = Record<string, string | undefined>;

export const SITE_NAME = "오늘은 뭐 먹지?";
// app/manifest.ts의 description과 같은 문장이다.
export const SITE_DESCRIPTION = "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.";

const DEV_URL = "http://localhost:3000";

/**
 * 끝에 "/"가 없는 정식 주소. 예: "https://a.example"
 *
 * SITE_URL이 없으면 개발용 주소를 돌려준다(정식 빌드에서는 next.config.ts가 경고한다).
 * 값이 있는데 웹 주소 꼴이 아니면 멈춘다. "https://"를 빼먹은 값을 그대로 내보내면
 * 검색엔진이 틀린 주소를 대표 주소로 기억하는데, 화면에는 아무 단서도 남지 않기 때문이다.
 *
 * 받은 글자를 그대로 돌려주지 않고 읽어 낸 결과(origin)를 돌려준다. 그래야 글자를 이어 붙여
 * 주소를 만드는 robots.ts·sitemap.ts와, 주소로 읽어 쓰는 metadataBase가 같은 주소를 낸다.
 * 뒤에 붙은 경로는 뗀다. 이 서비스는 주소의 맨 위에서만 열린다.
 */
export function siteUrl(env: Env = process.env): string {
  const raw = env.SITE_URL?.trim();
  if (!raw) return DEV_URL;
  // "localhost:3000"처럼 앞머리를 빼먹은 값도 주소로 읽히기는 한다("localhost:"가 앞머리가 된다).
  // 그래서 읽히는지만 보지 않고 앞머리가 웹 주소의 것인지까지 본다.
  const url = URL.canParse(raw) ? new URL(raw) : null;
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error(
      `[random-choice] SITE_URL이 웹 주소 꼴이 아닙니다: "${raw}". https://로 시작하는 전체 주소를 넣어 주세요.`,
    );
  }
  return url.origin;
}

/** 소유 확인 코드. 둘 다 없으면 항목 자체를 만들지 않아, 내용이 빈 태그가 나가지 않는다. */
function verification(env: Env): Metadata["verification"] {
  const google = env.GOOGLE_SITE_VERIFICATION?.trim();
  const naver = env.NAVER_SITE_VERIFICATION?.trim();
  if (!google && !naver) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(naver ? { other: { "naver-site-verification": naver } } : {}),
  };
}

/**
 * <head>에 들어갈 정보. 주소가 필요한 항목은 "/"처럼 상대 경로로 적고, Next.js가
 * metadataBase를 앞에 붙여 전체 주소로 만든다.
 * 미리보기 그림은 여기 적지 않는다. app/opengraph-image.png를 Next.js가 스스로 넣는다.
 */
export function siteMetadata(env: Env = process.env): Metadata {
  return {
    metadataBase: new URL(siteUrl(env)),
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      locale: "ko_KR",
    },
    twitter: { card: "summary_large_image" },
    verification: verification(env),
  };
}
