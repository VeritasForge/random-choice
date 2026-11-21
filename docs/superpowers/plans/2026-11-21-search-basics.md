# 검색엔진과 링크 공유를 위한 기본 정비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면을 늘리지 않고, 검색엔진이 시작 화면을 정확하게 읽고 링크를 붙였을 때 미리보기가 나타나게 하며, Google과 네이버에 사이트를 등록할 수 있게 한다.

**Architecture:** 서비스의 정식 주소는 환경변수 `SITE_URL` 하나에서 나오고, 그 값을 읽는 코드는 `web/lib/site.ts` 한 곳뿐이다. 같은 파일의 `siteMetadata()`가 `<head>`에 들어갈 정보를 만들고 `web/app/layout.tsx`는 그것을 내보내기만 한다(`layout.tsx`는 글꼴을 불러와서 시험에서 직접 읽을 수 없기 때문이다). `robots.txt`·`sitemap.xml`·공유 그림은 Next.js의 파일 규칙(`app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.png`)으로 내보낸다.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, vitest(node 환경). 새 의존성 없음(그림 변환에는 Next.js가 이미 데려온 `sharp`를 쓴다).

**Spec:** `docs/superpowers/specs/2026-11-21-search-basics-design.md`

**완료조건(플랜 전체):** `just check`가 통과하고, `SITE_URL`을 준 채 빌드해 띄운 화면에서 Task 3의 확인 명령이 전부 기대한 출력을 내며, README가 갱신되어 있다. 환경변수 등록·배포·검색엔진 등록(맨 끝 절)은 운영자가 한다.

## Global Constraints

- 기존 다섯 화면(시작, 위치 검색, 후보 고르기, 결과, 기록)의 모습과 동작을 바꾸지 않는다. `web/components/`와 `web/app/page.tsx`는 건드리지 않는다.
- 새 페이지를 만들지 않는다. 새 npm 패키지를 설치하지 않는다.
- 정식 주소 문자열(`random-choice-gamma.vercel.app`)을 코드에 적지 않는다. `process.env.SITE_URL`을 읽는 곳은 `web/lib/site.ts`와 경고를 내는 `web/next.config.ts` 둘뿐이다.
- 제목은 `오늘은 뭐 먹지?`, 설명은 `주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.`를 글자 그대로 쓴다. 후기·사용자 수 같은 없는 증거를 어디에도 넣지 않는다.
- `robots.txt`에서 막는 주소는 `/api/` 하나다. `/stats`는 적지 않는다(설계 문서 6-3절).
- `web/app/manifest.ts`와 `web/app/stats/page.tsx`는 고치지 않는다.
- Next.js 관련 코드를 쓰기 전에 `web/node_modules/next/dist/docs/01-app/03-api-reference/`의 해당 안내서를 읽는다(`web/AGENTS.md`): `04-functions/generate-metadata.md`, `03-file-conventions/01-metadata/robots.md`·`sitemap.md`·`opengraph-image.md`. 코드 리뷰는 `vercel:nextjs` 스킬의 기준을 포함한다.
- 커밋 메시지는 이 저장소의 관례(`feat(web): …한다`, `docs: …적는다`)를 따른다. 작업 브랜치는 `feat/search-basics`다.

## Review Focus

설계 문서가 직접 말하지 않지만 운영자가 겪을 수 있는 경우다. 각 줄의 시험은 Task 1·2에 들어 있다.

1. `SITE_URL` 끝에 `/`가 붙은 경우(`https://a.example/`): 사이트맵과 `robots.txt`의 주소에 `//`가 생기지 않아야 한다.
2. `SITE_URL`이 없거나 빈칸뿐인 경우: 개발용 주소 `http://localhost:3000`으로 동작하고, 정식 빌드에서는 경고가 뜬다.
3. `SITE_URL`에 `https://`를 빼먹은 경우(`random-choice-gamma.vercel.app`): 조용히 틀린 주소를 내보내지 않고, `SITE_URL`이라는 이름이 든 오류로 빌드가 멈춘다.
4. 소유 확인 코드가 없거나 빈 문자열인 경우: 내용이 빈 확인 태그를 내보내지 않는다.
5. 소유 확인 코드가 한쪽만 있는 경우: 있는 쪽 태그만 나온다.

---

### Task 1: 정식 주소와 `<head>` 정보

**Files:**
- Create: `web/lib/site.ts`
- Test: `web/lib/site.test.ts`
- Modify: `web/app/layout.tsx:15-18` (`metadata`를 `siteMetadata()`로 바꾼다)
- Modify: `web/next.config.ts` (`API_ORIGIN` 경고 바로 아래에 `SITE_URL` 경고를 더한다)

**Interfaces:**
- Produces:
  ```ts
  type Env = Record<string, string | undefined>;
  export const SITE_NAME = "오늘은 뭐 먹지?";
  export const SITE_DESCRIPTION = "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다.";
  /** 끝에 "/"가 없는 정식 주소. 예: "https://a.example" */
  export function siteUrl(env?: Env): string;
  export function siteMetadata(env?: Env): Metadata; // import type { Metadata } from "next"
  ```
  `env`의 기본값은 `process.env`다.

- [ ] **Step 0: 브랜치를 만들고 문서를 올린다**

```bash
git switch -c feat/search-basics
git add docs/superpowers/specs/2026-11-21-search-basics-design.md docs/superpowers/plans/2026-11-21-search-basics.md
git commit -m "docs: 검색엔진·링크 공유 기본 정비의 설계와 계획을 적는다"
```

- [ ] **Step 1: 실패하는 시험을 쓴다** (`web/lib/site.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { SITE_DESCRIPTION, SITE_NAME, siteMetadata, siteUrl } from "./site";

describe("정식 주소", () => {
  it("SITE_URL을 그대로 쓴다", () => {
    expect(siteUrl({ SITE_URL: "https://a.example" })).toBe("https://a.example");
  });
  it("끝의 /와 앞뒤 빈칸을 뗀다", () => {
    expect(siteUrl({ SITE_URL: " https://a.example/ " })).toBe("https://a.example");
  });
  it("없거나 빈칸뿐이면 개발용 주소다", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ SITE_URL: "  " })).toBe("http://localhost:3000");
  });
  it("https://를 빼먹으면 이름을 밝힌 오류를 낸다", () => {
    expect(() => siteUrl({ SITE_URL: "a.example" })).toThrow(/SITE_URL/);
  });
});

describe("head 정보", () => {
  const m = siteMetadata({ SITE_URL: "https://a.example" });
  it("제목과 설명은 그대로다", () => {
    expect(m.title).toBe(SITE_NAME);
    expect(m.description).toBe(SITE_DESCRIPTION);
  });
  it("주소의 기준과 대표 주소를 알린다", () => {
    expect(String(m.metadataBase)).toBe("https://a.example/");
    expect(m.alternates).toEqual({ canonical: "/" });
  });
  it("링크 미리보기 정보를 알린다", () => {
    expect(m.openGraph).toEqual({
      type: "website",
      url: "/",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      locale: "ko_KR",
    });
    expect(m.twitter).toEqual({ card: "summary_large_image" });
  });
  it("소유 확인 코드가 없으면 확인 항목 자체가 없다", () => {
    expect(m.verification).toBeUndefined();
    expect(
      siteMetadata({ GOOGLE_SITE_VERIFICATION: "", NAVER_SITE_VERIFICATION: " " }).verification,
    ).toBeUndefined();
  });
  it("있는 쪽 확인 코드만 낸다", () => {
    expect(siteMetadata({ GOOGLE_SITE_VERIFICATION: "g1" }).verification).toEqual({ google: "g1" });
    expect(siteMetadata({ NAVER_SITE_VERIFICATION: "n1" }).verification).toEqual({
      other: { "naver-site-verification": "n1" },
    });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && npx vitest run lib/site.test.ts`
Expected: FAIL (`./site`를 찾지 못한다)

- [ ] **Step 3: `web/lib/site.ts`를 만든다**

위 Interfaces의 네 가지를 내보낸다. `siteUrl`은 `new URL(값)`으로 형식을 검사하고, 실패하면 `SITE_URL`과 받은 값을 넣은 오류를 던진다. 파일 머리 주석에 "정식 주소를 읽는 곳은 여기 하나이고, 자체 도메인으로 옮길 때는 환경변수 값만 바꾼다"는 것을 적는다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && npx vitest run lib/site.test.ts`
Expected: PASS (9개)

- [ ] **Step 5: `web/app/layout.tsx`의 `metadata`를 바꾼다**

`export const metadata: Metadata = siteMetadata();`로 바꾸고, 제목·설명 문자열은 이 파일에서 지운다. 그 위에 "무엇이 들어가는지는 `lib/site.ts`에 있다. 이 파일은 글꼴을 불러와서 시험에서 읽을 수 없으므로 판단을 그쪽에 두었다"는 주석을 둔다.

- [ ] **Step 6: `web/next.config.ts`에 경고를 더한다**

`API_ORIGIN` 경고와 같은 조건·같은 형식으로, `SITE_URL`이 없는 정식 빌드에서 다음을 `console.warn`으로 낸다:
`[random-choice] SITE_URL이 설정되지 않았습니다. 대표 주소·사이트맵·링크 미리보기가 http://localhost:3000 으로 나가므로, 검색엔진과 메신저가 이 서비스의 주소를 잘못 알게 됩니다.`

- [ ] **Step 7: 빌드해서 확인한다**

Run: `cd web && npm run build 2>&1 | grep -c "SITE_URL이 설정되지 않았습니다"` → 1 이상
Run: `cd web && SITE_URL=https://a.example npm run build 2>&1 | grep -c "SITE_URL이 설정되지 않았습니다"` → 0
Run: `cd web && SITE_URL=a.example npm run build; echo "exit=$?"` → 출력에 `SITE_URL`이 든 오류가 있고 `exit`가 0이 아니다
Run: `cd web && npm test && npx tsc --noEmit && npm run lint` → 모두 통과

- [ ] **Step 8: 커밋한다**

```bash
git add web/lib/site.ts web/lib/site.test.ts web/app/layout.tsx web/next.config.ts
git commit -m "feat(web): 정식 주소를 환경변수 하나로 받아 대표 주소와 링크 미리보기 정보를 낸다"
```

---

### Task 2: `robots.txt`와 `sitemap.xml`

**Files:**
- Create: `web/app/robots.ts`, `web/app/sitemap.ts`
- Test: `web/app/robots.test.ts`, `web/app/sitemap.test.ts`

**Interfaces:**
- Consumes: `siteUrl()` from `@/lib/site` (Task 1)
- Produces: `export default function robots(): MetadataRoute.Robots`, `export default function sitemap(): MetadataRoute.Sitemap`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`web/app/robots.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("/api/만 막고 사이트맵 주소를 알린다", () => {
    vi.stubEnv("SITE_URL", "https://a.example/");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://a.example/sitemap.xml",
    });
  });
  it("운영자용 화면의 주소를 적지 않는다", () => {
    expect(JSON.stringify(robots())).not.toContain("stats");
  });
});
```

`web/app/sitemap.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap.xml", () => {
  it("시작 화면 하나만 알린다", () => {
    vi.stubEnv("SITE_URL", "https://a.example/");
    expect(sitemap()).toEqual([{ url: "https://a.example/" }]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd web && npx vitest run app/robots.test.ts app/sitemap.test.ts`
Expected: FAIL (두 파일을 찾지 못한다)

- [ ] **Step 3: `web/app/robots.ts`와 `web/app/sitemap.ts`를 만든다**

`web/app/manifest.ts`와 같은 꼴(`MetadataRoute` 타입, 머리 주석)로 쓴다. `robots.ts`의 주석에는 `/stats`를 적지 않는 두 가지 이유(비밀번호가 지키고 있다, 이 파일은 누구나 읽는다)를 설계 문서 6-3절을 가리키며 적는다. `sitemap.ts`에는 `lastModified`를 넣지 않는다(빌드할 때마다 바뀌는 값을 넣으면 내용이 그대로인데도 바뀐 것처럼 알리게 된다).

- [ ] **Step 4: 통과를 확인한다**

Run: `cd web && npm test`
Expected: PASS (전체)

- [ ] **Step 5: 커밋한다**

```bash
git add web/app/robots.ts web/app/robots.test.ts web/app/sitemap.ts web/app/sitemap.test.ts
git commit -m "feat(web): 검색엔진에 수집 범위와 페이지 목록을 알린다"
```

---

### Task 3: 링크 미리보기 그림과 전체 확인

**Files:**
- Create: `web/assets/og-image.svg` (원본), `web/app/opengraph-image.png` (만들어진 그림), `web/app/opengraph-image.alt.txt`
- Modify: `web/scripts/make-icons.mjs` (정사각형이 아닌 출력을 받게 한다)
- Test: `web/app/manifest.test.ts` (그림 크기 시험 한 줄을 더한다)

**Interfaces:**
- Consumes: Task 1·2의 결과 전부(마지막 확인 단계에서 함께 본다)

- [ ] **Step 1: 실패하는 시험을 더한다**

`web/app/manifest.test.ts`의 `describe` 맨 끝에 더한다(같은 파일의 `pngSize`를 쓴다):

```ts
  it("링크 미리보기 그림은 가로 1200, 세로 630이다", () => {
    expect(pngSize("app/opengraph-image.png")).toEqual([1200, 630]);
  });
```

Run: `cd web && npx vitest run app/manifest.test.ts` → FAIL (파일이 없다)

- [ ] **Step 2: 원본 `web/assets/og-image.svg`를 그린다**

- `viewBox="0 0 1200 630"`, 바탕은 `#e8d6b4`(나무색)로 가득 채운다.
- `web/assets/app-icon.svg`의 그릇 그림(둘째 줄부터의 `path`·`circle`)을 흰 바탕 사각형 없이 가져와 왼쪽에 크게 두고, 오른쪽에 `오늘은 뭐 먹지?`를 `#1c1a17`로 둔다. 그 밖의 글자·숫자는 넣지 않는다.
- 글자의 `font-family`는 `'Noto Serif KR', AppleMyungjo, 'Nanum Myeongjo', serif`다. 파일 머리 주석에 "고친 뒤에는 `node scripts/make-icons.mjs`를 다시 돌린다. 글자는 이 스크립트를 돌린 컴퓨터에 깔린 글꼴로 그려지므로, 만든 PNG를 눈으로 확인한다"를 적는다.
- 카카오톡은 미리보기 그림의 가운데 부분만 잘라 보여 주는 경우가 있으므로, 그릇과 글자를 가로 가운데 800 폭 안에 둔다.

- [ ] **Step 3: `web/scripts/make-icons.mjs`가 이 그림도 만들게 한다**

`outputs`의 항목이 `size`(정사각형) 대신 `width`·`height`도 받을 수 있게 하고, `{ from: "assets/og-image.svg", to: "app/opengraph-image.png", width: 1200, height: 630 }`을 더한다. 파일 머리 주석의 "홈 화면 아이콘"을 "홈 화면 아이콘과 링크 미리보기 그림"으로 고친다.

Run: `cd web && node scripts/make-icons.mjs`
Expected: 기존 네 줄과 `app/opengraph-image.png (1200×630)`이 출력된다. `git status --short web/public web/app/apple-icon.png`에 변경이 없다(기존 아이콘이 달라지지 않았다).

- [ ] **Step 4: 만든 그림을 눈으로 확인한다**

`web/app/opengraph-image.png`를 열어, 한글이 네모(□)로 깨지지 않았는지와 그릇·글자가 가운데 800 폭 안에 있는지 본다. 깨졌으면 `font-family`에서 이 컴퓨터에 있는 한글 글꼴(`fc-list :lang=ko | head`)을 앞에 두고 Step 3을 다시 돌린다.

- [ ] **Step 5: 그림 설명을 둔다**

`web/app/opengraph-image.alt.txt`의 내용은 한 줄이다: `오늘은 뭐 먹지? 웃는 얼굴의 밥그릇 그림`

Run: `cd web && npm test` → PASS

- [ ] **Step 6: 빌드해 띄우고 전부 확인한다**

```bash
cd web && SITE_URL=https://a.example GOOGLE_SITE_VERIFICATION=g1 NAVER_SITE_VERIFICATION=n1 npm run build
SITE_URL=https://a.example GOOGLE_SITE_VERIFICATION=g1 NAVER_SITE_VERIFICATION=n1 STATS_PASSWORD=pw npx next start -p 3100 &
```

| 명령 | 기대하는 출력 |
|---|---|
| `curl -s localhost:3100/robots.txt` | `User-Agent: *`, `Allow: /`, `Disallow: /api/`, `Sitemap: https://a.example/sitemap.xml`. `stats`라는 글자가 없다 |
| `curl -s localhost:3100/sitemap.xml` | `<loc>https://a.example/</loc>` 하나 |
| `curl -s localhost:3100/ \| grep -o '<link rel="canonical"[^>]*>'` | `href="https://a.example"` 또는 `https://a.example/` |
| `curl -s localhost:3100/ \| grep -o '<meta property="og:[a-z:_]*" content="[^"]*"'` | `og:title`, `og:description`, `og:url`, `og:site_name`, `og:locale`, `og:type`, `og:image`(주소가 `https://a.example/opengraph-image`로 시작), `og:image:width` 1200, `og:image:height` 630, `og:image:alt` |
| `curl -s localhost:3100/ \| grep -o '<meta name="twitter:[a-z:]*" content="[^"]*"'` | `twitter:card`가 `summary_large_image`, `twitter:image`가 있다 |
| `curl -s localhost:3100/ \| grep -o '<meta name="[a-z-]*verification" content="[^"]*"'` | `google-site-verification`이 `g1`, `naver-site-verification`이 `n1` |
| 위에서 나온 `og:image` 주소의 `https://a.example`을 `localhost:3100`으로 바꿔 `curl -s -o /dev/null -w '%{http_code} %{content_type}' <그 주소>` | `200 image/png` |
| `curl -s -o /dev/null -w '%{http_code}' localhost:3100/stats` | `401` |
| `curl -s -u x:pw localhost:3100/stats \| grep -o 'noindex'` | `noindex` (Go 서버가 꺼져 있어 화면이 오류로 나오면 README의 "접속 통계까지 내 컴퓨터에서 보려면" 절대로 서버를 띄운 뒤 다시 본다) |

`twitter:image`가 나오지 않으면 `make-icons.mjs`의 `outputs`에 같은 원본으로 `app/twitter-image.png`(1200×630)를 더해 다시 만들고, `opengraph-image.alt.txt`와 같은 내용의 `twitter-image.alt.txt`를 둔 뒤 이 단계를 되풀이한다.

끝나면 `next start`를 끈다.

- [ ] **Step 7: 커밋한다**

```bash
git add web/assets/og-image.svg web/app/opengraph-image.png web/app/opengraph-image.alt.txt web/scripts/make-icons.mjs web/app/manifest.test.ts
git commit -m "feat(web): 링크를 붙였을 때 나오는 미리보기 그림을 더한다"
```

(`twitter-image` 파일을 만들었다면 함께 올린다.)

---

### Task 4: 문서, 전체 검증, 코드 리뷰

**Files:**
- Modify: `README.md` ("환경변수 — 두 프로젝트에 여섯 자리" 절과 그 아래)

- [ ] **Step 1: README의 환경변수 표를 고친다**

절 제목의 "여섯 자리"를 "아홉 자리"로 바꾸고 표에 세 줄을 더한다(모두 `random-choice` 프로젝트):

| 이름 | 무엇 |
|---|---|
| `SITE_URL` | 이 서비스의 정식 주소(`https://`로 시작). 대표 주소·사이트맵·링크 미리보기가 이 값으로 나갑니다. 없으면 `http://localhost:3000`으로 나가고 빌드할 때 경고가 뜹니다. 정식(Production) 환경에만 넣습니다 |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console이 발급한 소유 확인 코드. 없으면 확인 태그를 내지 않습니다 |
| `NAVER_SITE_VERIFICATION` | 네이버 서치어드바이저가 발급한 소유 확인 코드. 없으면 확인 태그를 내지 않습니다 |

README의 다른 곳에 환경변수 개수나 "여섯"이 적혀 있는지 `grep -n "여섯\|환경변수" README.md`로 찾아 함께 맞춘다.

- [ ] **Step 2: README에 "검색엔진에 등록하기" 절을 더한다**

환경변수 절 뒤에 둔다. 처음 보는 사람이 따라 할 수 있게 다음을 적는다.

1. 왜 하는가: 등록해야 검색엔진이 사이트맵을 받아 가고, 사람들이 어떤 검색어로 들어오는지 통계로 볼 수 있다.
2. 순서: 두 곳(Google Search Console, 네이버 서치어드바이저)에서 사이트 주소를 추가하고 "HTML 태그" 방식의 코드를 발급받는다 → 코드의 `content` 값만 떼어 위 환경변수 둘에 넣는다 → 다시 배포한다(`just deploy-web`) → 두 곳에서 확인을 누른다 → 사이트맵 주소(`정식 주소/sitemap.xml`)를 제출한다.
3. 네이버가 보여 주는 태그의 `name`이 `naver-site-verification`이 아니면 `web/lib/site.ts`의 이름을 그것에 맞춘다.
4. 바꾼 뒤 확인하는 법: `curl -s 정식주소/robots.txt`, 카카오톡 대화방에 주소를 붙여 미리보기 보기. 카카오톡은 미리보기를 기억해 두므로, 예전 모습이 나오면 카카오 개발자 사이트의 공유 디버거에서 초기화한다.
5. 자체 도메인으로 옮길 때 할 일: `SITE_URL`을 새 주소로 바꾸고, 옛 주소를 새 주소로 넘기는 설정을 Vercel에 두고, 두 검색엔진에 새 주소를 다시 등록한다.
6. `/stats`는 `robots.txt`에 적지 않는다는 것과 그 이유 두 가지(설계 문서 6-3절의 내용을 README 본문에 옮겨 적는다).

- [ ] **Step 3: 옛 문장이 남았는지 본다**

Run: `grep -rn "여섯 자리" README.md docs/ ; grep -rn "random-choice-gamma" web/app web/lib web/next.config.ts`
Expected: 첫 명령은 이번에 고친 README에서 나오지 않고(옛 설계·계획 문서에 남은 것은 그대로 둔다), 둘째 명령은 아무것도 나오지 않는다.

- [ ] **Step 4: 전체 검증**

Run: `just check`
Expected: 서버·화면 시험, 빌드, 타입 검사, 린트가 모두 통과한다.

- [ ] **Step 5: 코드 리뷰**

`/code-review`를 한 번 돌린다(구현을 서브에이전트 방식으로 했다면 그쪽의 리뷰로 갈음한다). Next.js 코드이므로 `vercel:nextjs` 스킬의 기준을 포함한다. 지적을 고쳤으면 Step 4를 다시 돌린다.

- [ ] **Step 6: 커밋한다**

```bash
git add README.md
git commit -m "docs: 정식 주소 환경변수와 검색엔진 등록 순서를 적는다"
```

---

## 알고 두는 것

- `web/app/layout.tsx`에 둔 대표 주소(`/`)와 미리보기 정보는 `/stats`에도 그대로 내려간다. `/stats`는 비밀번호 없이는 화면을 주지 않고 검색 제외 표시도 있으므로 실제로 문제가 되는 경우가 없어 이번에는 고치지 않는다. 나중에 공개 페이지를 더하게 되면 그 페이지마다 대표 주소를 따로 주어야 한다.
- 시작 화면(`/`)은 빌드할 때 만들어지므로 환경변수를 바꾼 뒤에는 다시 배포해야 반영된다.

## 운영자가 하는 일 (코드가 합쳐진 뒤)

1. Vercel의 `random-choice` 프로젝트 정식(Production) 환경에 `SITE_URL=https://random-choice-gamma.vercel.app`을 넣고 배포한다.
2. `curl -s https://random-choice-gamma.vercel.app/robots.txt`와 `/sitemap.xml`에 정식 주소가 나오는지 본다.
3. 카카오톡 대화방에 주소를 붙여 제목·설명·그림이 나오는지 본다.
4. README의 "검색엔진에 등록하기" 순서대로 두 곳에 등록한다.
5. 2~4주 뒤 두 곳의 통계에서 유입 검색어를 보고, 다음에 무엇을 만들지 판단한다(설계 문서 9절).
