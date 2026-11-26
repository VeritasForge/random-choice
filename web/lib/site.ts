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

/**
 * 공유 화면(/s/장소번호)의 <head> 정보. path는 그 화면 자신의 경로다.
 *
 * openGraph의 항목을 전부 다시 적는 이유: Next.js는 화면이 openGraph를 내면 위쪽(layout.tsx)의
 * openGraph를 항목별로 합치지 않고 통째로 갈아 끼운다. 여기서 빠뜨린 항목은 물려받지 않고
 * 사라진다. metadataBase·twitter·verification은 적지 않았으므로 위쪽 것을 그대로 물려받는다.
 *
 * 제목에 서비스 이름을 잇지 않는다. 이으면 "오늘은 돈까스·우동 | 오늘은 뭐 먹지?"처럼
 * "오늘은"이 두 번 나온다. 서비스 이름은 siteName으로만 나간다.
 *
 * 검색에서 빼는 이유: 주소의 조합이 끝없이 많고, 내용은 끼워 넣은 카카오 페이지다.
 */
export function shareMetadata(title: string, path: string): Metadata {
  return {
    title,
    description: SITE_DESCRIPTION,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE_NAME,
      title,
      description: SITE_DESCRIPTION,
      locale: "ko_KR",
      // 시작 화면에서는 app/opengraph-image.png를 Next.js가 스스로 넣지만, 그 그림은 그 파일이
      // 놓인 층의 openGraph에 실려 오는 것이라 여기서 openGraph를 갈아 끼우면 함께 사라진다
      // (2026-11-27 빌드 결과로 확인: 적지 않으면 og:image가 나가지 않는다). 그래서 같은 그림을
      // 직접 가리킨다. 크기는 그 파일의 실제 크기이고, 설명 글은 app/opengraph-image.alt.txt와
      // 같아야 한다(site.test.ts가 대조한다).
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: "오늘은 뭐 먹지? 웃는 얼굴의 밥그릇 그림",
        },
      ],
    },
    robots: { index: false, follow: false },
  };
}
