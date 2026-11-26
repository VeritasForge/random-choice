# 정한 가게를 동료에게 보내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결과 화면에서 한 곳을 정한 사람이 `보내기`로 그 가게를 보내고, 받은 사람이 링크를 누르면 음식 종류와 카카오 가게 페이지가 바로 보이는 우리 서비스의 공유 화면(`/s/장소번호?c=종류`)에 도착하게 한다.

**Architecture:** 링크를 만들고 읽는 규칙, 보내는 글, 음식 종류 이름표, "공유 창을 열지 복사할지"의 판단은 모두 순수 함수 모듈 `web/lib/share.ts`에 두고 시험한다. 공유 화면은 새 경로 `web/app/s/[placeNo]/page.tsx`(서버에서 그리는 화면)이고, 제목 같은 머리 정보는 `web/lib/site.ts`가 만든다. 보내는 쪽은 작은 버튼 컴포넌트 `web/components/ShareButton.tsx`를 결과 화면의 "맛있게 드세요" 상자에 넣는다. 메인 화면의 상태 전환은 건드리지 않는다.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 5, Tailwind 4, vitest (node 환경, 화면 `.tsx`는 시험하지 않는 구성: `web/vitest.config.mts`). 새 라이브러리는 넣지 않는다.

**Spec:** `docs/superpowers/specs/2026-11-26-share-result-design.md`

## 완료 조건 (플랜 전체)

- 저장소 맨 위에서 `just check` 통과(서버 시험·vet, 화면 build·test·tsc·lint).
- `cd web && npm test` 결과에 새 `share.test.ts`와 늘어난 `site.test.ts`가 들어 있고 통과.
- Task 3 Step 5의 `curl` 확인 넷, Task 3 Step 6과 Task 4 Step 7의 화면 확인이 모두 기대대로.
- `/code-review`와 `web-design-guidelines` 감사(Task 5)에서 이번 변경 부분에 남은 지적 없음.
- `grep -rn "화면은 다섯 개" PRODUCT.md README.md` 결과 없음(옛 문장 잔재 없음).
- 배포 뒤 운영자가 휴대폰으로 하는 확인 셋(Task 5 Step 6)은 이 플랜의 완료 조건이 아니라 운영자에게 넘기는 일이다.

## Global Constraints

- 이 worktree에는 `web/node_modules`가 없다. 첫 작업 전에 `cd web && npm ci`를 한 번 돌린다.
- 판단은 `web/lib/`에 두고 시험을 붙인다. `web/app/`과 `web/components/`의 파일은 그 함수를 부르는 껍데기로 둔다(화면 시험이 node에서 돌아 `.tsx`를 실행하지 못한다).
- 주소에 담긴 글자를 화면에 그대로 그리지 않는다. 화면에 보이는 글자는 우리 코드 안의 것이거나 카카오 페이지가 그리는 것이다.
- 장소 번호는 ASCII 숫자만(`[0-9]`), 1자 이상 20자 이하(`MAX_PLACE_NUMBER_LENGTH = 20`).
- 가게 페이지 주소는 반드시 `kakaoPlaceUrl`(`web/lib/visits.ts`)을 통과한 값만 `href`·`src`에 넣는다.
- 끼워 넣는 가게 페이지에는 `SHEET_SANDBOX`(`web/lib/sheet.ts`)를 그대로 건다. 값을 바꾸지 않는다.
- 문구(글자 그대로):
  - 버튼: `보내기`, `나도 뽑아 보기`, `카카오에서 열기`
  - 보내는 글: `오늘은 {종류 이름}, {가게 이름} 어때요?`
  - 공유 화면 머리글과 제목: 종류를 알면 `오늘은` + `{종류 이름}`(제목은 `오늘은 {종류 이름}`), 모르면 `오늘 점심, 여기 어때요?`
  - 복사 알림: `복사했어요`
- 한 화면에 강조색 버튼(`btn-primary`)은 하나뿐이다. 결과 화면의 `보내기`는 `btn btn-quiet btn-sm`, 공유 화면의 `나도 뽑아 보기`만 `btn btn-primary`다.
- 말투는 `~해요` 체, 버튼은 기존 `btn` 계열 클래스를 쓴다(`DESIGN.md`, `web/app/globals.css`).
- 제목에 서비스 이름을 이어 붙이지 않는다.
- Next.js 16은 예전 방식과 다른 곳이 있다. 경로 매개변수와 머리 정보를 다루기 전에 `web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`와 `.../03-file-conventions/dynamic-routes.md`를 읽는다(`params`와 `searchParams`는 `Promise`다. 선례: `web/app/stats/page.tsx`).
- React 코드를 고치는 Task(3·4)는 `vercel-react-best-practices`와 `vercel-composition-patterns` 스킬 기준을 따른다.

## Review Focus

- **주소의 종류 값이 객체의 기본 속성 이름일 때**(`?c=constructor`, `?c=__proto__`, `?c=toString`): 종류를 모르는 것으로 보고 가게만 보여 줘야 한다. 이름표를 그냥 객체로 두고 `표[값]`으로 읽으면 함수가 나온다 → Task 1 시험 `객체의 기본 속성 이름은 종류가 아니다`.
- **종류 값이 두 번 온 주소**(`?c=bunsik&c=gogi`): 오류가 아니라 종류 없는 화면 → Task 1 시험 `종류가 여러 번 오면 모르는 것으로 본다`.
- **숫자처럼 보이지만 ASCII가 아닌 장소 번호**(전각 숫자 `１２３`), 빈 값, 21자: 404 → Task 1 시험 `숫자가 아닌 장소 번호는 받지 않는다`.
- **카카오가 준 가게 주소가 `http://`이거나 뒤에 물음표가 붙은 경우**: 번호를 뽑아낸다. `/m/123`처럼 다른 꼴이면 버튼을 숨긴다 → Task 1 시험 `가게 주소에서 장소 번호를 얻는다`.
- **사용자가 공유 창을 그냥 닫은 경우와, 공유 창이 있는데 거절된 경우**: 앞은 아무 일도 없고(복사하지 않는다), 뒤는 복사로 넘어간다 → Task 4 시험 `닫으면 아무것도 하지 않는다`, `공유가 거절되면 복사한다`.

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `web/lib/share.ts` (새로) | 종류 이름표, 장소 번호 뽑기, 링크 만들기·읽기, 보내는 글, 보내기 판단 |
| `web/lib/share.test.ts` (새로) | 위의 시험과 Go 소스 대조 |
| `web/lib/site.ts` (고침) | 공유 화면의 머리 정보를 만드는 `shareMetadata` 추가 |
| `web/lib/site.test.ts` (고침) | `shareMetadata` 시험 추가 |
| `web/app/s/[placeNo]/page.tsx` (새로) | 공유 화면 |
| `web/components/ShareButton.tsx` (새로) | `보내기` 버튼 |
| `web/components/ResultScreen.tsx` (고침) | 종류 식별자를 받고, "맛있게 드세요" 상자에 `보내기`를 둔다 |
| `web/app/page.tsx` (고침) | `ResultScreen`에 종류 식별자를 넘긴다(656행 근처 한 줄) |
| `README.md`, `PRODUCT.md`, `docs/todo.md` (고침) | 설계 문서 6-7절 |

---

### Task 1: 링크·글·이름표 규칙 (`web/lib/share.ts`)

**쓸 스킬:** `superpowers:test-driven-development`

**Files:**
- Create: `web/lib/share.ts`
- Test: `web/lib/share.test.ts`

**Interfaces:**
- Consumes: `kakaoPlaceUrl(value: unknown): string | null` (`web/lib/visits.ts`)
- Produces:
  - `MAX_PLACE_NUMBER_LENGTH = 20`
  - `CUISINE_LABELS: ReadonlyMap<string, string>` (식별자 → 이름, 18짝)
  - `cuisineLabel(id: unknown): string | null`
  - `placeNumber(placeUrl: unknown): string | null`
  - `sharePath(placeNo: string, cuisineId: string): string`
  - `type Share = { placeNo: string; placeUrl: string; cuisineId: string | null; cuisineLabel: string | null }`
  - `parseShare(placeNo: string, c: string | string[] | undefined): Share | null`
  - `shareText(cuisineLabel: string, placeName: string): string`
  - `shareTitle(cuisineLabel: string | null): string`

- [ ] **Step 0: 의존성 설치**

Run: `cd web && npm ci && npm test`
Expected: 기존 시험이 모두 통과.

- [ ] **Step 1: 실패하는 시험을 쓴다** (`web/lib/share.test.ts`)

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUISINE_LABELS, cuisineLabel, parseShare, placeNumber,
  sharePath, shareText, shareTitle,
} from "./share";

describe("종류 이름표", () => {
  it("아는 식별자는 이름을 준다", () => {
    expect(cuisineLabel("donkatsu")).toBe("돈까스·우동");
  });
  it("모르는 값과 글자가 아닌 값은 null이다", () => {
    for (const v of ["", "nope", undefined, null, 3, ["donkatsu"]]) {
      expect(cuisineLabel(v)).toBeNull();
    }
  });
  it("객체의 기본 속성 이름은 종류가 아니다", () => {
    for (const v of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(cuisineLabel(v)).toBeNull();
    }
  });
  it("Go 서버의 종류 표와 짝이 정확히 같다", () => {
    const path = fileURLToPath(new URL("../../api/internal/cuisine/cuisine.go", import.meta.url));
    const source = readFileSync(path, "utf8");
    const fromGo = new Map(
      [...source.matchAll(/Cuisine\{"([a-z]+)",\s*"([^"]+)"\}/g)].map((m) => [m[1], m[2]]),
    );
    expect(fromGo.size, "Go 소스에서 찾은 종류가 줄었다. 대조 방법이 깨졌을 수 있다")
      .toBeGreaterThanOrEqual(18);
    expect(new Map(CUISINE_LABELS)).toEqual(fromGo);
  });
});

describe("가게 주소에서 장소 번호를 얻는다", () => {
  it("http와 https, 뒤에 붙은 물음표를 가리지 않는다", () => {
    expect(placeNumber("http://place.map.kakao.com/12345678")).toBe("12345678");
    expect(placeNumber("https://place.map.kakao.com/12345678?service=x#y")).toBe("12345678");
  });
  it("다른 꼴의 주소, 빈 값, 다른 사이트는 null이다", () => {
    for (const v of [
      "", "https://place.map.kakao.com/", "https://place.map.kakao.com/m/123",
      "https://place.map.kakao.com/12a", "https://evil.example/123",
      `https://place.map.kakao.com/${"1".repeat(21)}`, undefined,
    ]) {
      expect(placeNumber(v)).toBeNull();
    }
  });
});

describe("링크 만들기와 읽기", () => {
  it("만든 경로를 다시 읽으면 같은 값이 나온다", () => {
    expect(sharePath("12345678", "donkatsu")).toBe("/s/12345678?c=donkatsu");
    expect(parseShare("12345678", "donkatsu")).toEqual({
      placeNo: "12345678",
      placeUrl: "https://place.map.kakao.com/12345678",
      cuisineId: "donkatsu",
      cuisineLabel: "돈까스·우동",
    });
  });
  it("숫자가 아닌 장소 번호는 받지 않는다", () => {
    for (const v of ["", "abc", "12a", "１２３", "-1", "1.5", " 1", "1".repeat(21)]) {
      expect(parseShare(v, "donkatsu")).toBeNull();
    }
    expect(parseShare("1".repeat(20), "donkatsu")).not.toBeNull();
  });
  it("표에 없는 종류와 종류가 없는 경우는 종류 없이 연다", () => {
    for (const c of ["nope", "", undefined, "constructor"]) {
      expect(parseShare("123", c)).toEqual({
        placeNo: "123", placeUrl: "https://place.map.kakao.com/123",
        cuisineId: null, cuisineLabel: null,
      });
    }
  });
  it("종류가 여러 번 오면 모르는 것으로 본다", () => {
    expect(parseShare("123", ["bunsik", "gogi"])?.cuisineId).toBeNull();
  });
});

describe("글", () => {
  it("보내는 글은 종류, 가게 이름 순이다", () => {
    expect(shareText("돈까스·우동", "연돈")).toBe("오늘은 돈까스·우동, 연돈 어때요?");
  });
  it("제목은 종류를 알 때와 모를 때가 다르다", () => {
    expect(shareTitle("돈까스·우동")).toBe("오늘은 돈까스·우동");
    expect(shareTitle(null)).toBe("오늘 점심, 여기 어때요?");
  });
});
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `cd web && npx vitest run lib/share.test.ts`
Expected: FAIL (`./share`를 찾지 못함)

- [ ] **Step 3: `web/lib/share.ts`를 만든다**

위 Interfaces의 이름과 형태 그대로 만든다. 정해 둔 것은 다음과 같다.

- `CUISINE_LABELS`는 객체가 아니라 `Map`이다(기본 속성 이름이 섞이지 않게). 18짝의 값은 `api/internal/cuisine/cuisine.go`의 `rules`에서 옮긴다.
- `placeNumber`는 먼저 `kakaoPlaceUrl`을 통과시키고, 그 주소의 `pathname`이 정확히 `/` + 숫자 1~20자일 때만 숫자를 돌려준다.
- `parseShare`는 장소 번호를 `/^[0-9]{1,20}$/`로 검사하고, `placeUrl`은 `kakaoPlaceUrl("https://place.map.kakao.com/" + placeNo)`의 결과를 쓴다(null이면 null).
- `sharePath`는 종류 값을 `encodeURIComponent`로 감싼다.
- 파일 맨 위 주석에 "왜 가게 이름을 주소에 담지 않는가"(주소를 고쳐 우리 주소 아래에 임의의 글자를 띄우지 못하게)와 "왜 이름표가 화면 쪽에도 있는가"(공유 화면은 서버를 부르지 않고 그린다, 시험이 Go 소스와 대조한다)를 적는다.

- [ ] **Step 4: 시험이 통과하는지 본다**

Run: `cd web && npx vitest run lib/share.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/lib/share.ts web/lib/share.test.ts
git commit -m "feat(web): 정한 가게를 보내는 링크와 글, 음식 종류 이름표의 규칙을 더한다"
```

---

### Task 2: 공유 화면의 머리 정보 (`web/lib/site.ts`)

**쓸 스킬:** `superpowers:test-driven-development`

**Files:**
- Modify: `web/lib/site.ts` (`siteMetadata` 아래에 함수 하나 추가)
- Test: `web/lib/site.test.ts`

**Interfaces:**
- Produces: `shareMetadata(title: string, path: string): Metadata`

- [ ] **Step 1: 실패하는 시험을 더한다** (`web/lib/site.test.ts` 끝)

```ts
describe("공유 화면의 머리 정보", () => {
  const meta = shareMetadata("오늘은 돈까스·우동", "/s/123?c=donkatsu");
  it("제목은 받은 글자 그대로이고 서비스 이름을 붙이지 않는다", () => {
    expect(meta.title).toBe("오늘은 돈까스·우동");
    expect(meta.openGraph?.title).toBe("오늘은 돈까스·우동");
  });
  it("대표 주소와 미리보기 주소는 이 화면의 주소다", () => {
    expect(meta.alternates?.canonical).toBe("/s/123?c=donkatsu");
    expect(meta.openGraph?.url).toBe("/s/123?c=donkatsu");
  });
  it("서비스 이름과 설명은 사이트 공통 값을 쓴다", () => {
    expect(meta.openGraph).toMatchObject({
      type: "website", siteName: SITE_NAME, description: SITE_DESCRIPTION, locale: "ko_KR",
    });
    expect(meta.description).toBe(SITE_DESCRIPTION);
  });
  it("검색엔진 수집에서 뺀다", () => {
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
```

`import`에 `shareMetadata`를 더한다.

- [ ] **Step 2: 실패 확인**

Run: `cd web && npx vitest run lib/site.test.ts`
Expected: FAIL (`shareMetadata`가 없음)

- [ ] **Step 3: `shareMetadata`를 만든다**

`openGraph`는 `type`, `url`, `siteName`, `title`, `description`, `locale`을 **모두 직접 적는다.** Next.js는 화면이 `openGraph`를 내면 위쪽(`layout.tsx`)의 `openGraph`를 통째로 갈아 끼우므로, 빠뜨린 항목은 물려받지 않고 사라진다. 이 사실을 함수 주석에 적는다. `metadataBase`, `twitter`, `verification`은 적지 않는다(위쪽 것을 물려받는다).

- [ ] **Step 4: 통과 확인**

Run: `cd web && npx vitest run lib/site.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add web/lib/site.ts web/lib/site.test.ts
git commit -m "feat(web): 공유 화면의 제목과 대표 주소, 검색 제외 표시를 만드는 규칙을 더한다"
```

---

### Task 3: 공유 화면 (`/s/[placeNo]`)

**쓸 스킬:** `vercel-react-best-practices`, `vercel-composition-patterns`

**Files:**
- Create: `web/app/s/[placeNo]/page.tsx`

**Interfaces:**
- Consumes: `parseShare`, `shareTitle`, `sharePath`, `type Share` (Task 1), `shareMetadata` (Task 2), `SHEET_SANDBOX` (`web/lib/sheet.ts`), `SITE_NAME` (`web/lib/site.ts`), `VisitBeacon` (`web/components/VisitBeacon.tsx`)

- [ ] **Step 1: Next.js 16 문서를 읽는다**

`web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, `.../03-file-conventions/dynamic-routes.md`, `.../04-functions/not-found.md`. 선례는 `web/app/stats/page.tsx`(`PageProps<"/stats">`, `await searchParams`, `notFound()`).

- [ ] **Step 2: `web/app/s/[placeNo]/page.tsx`를 만든다**

서버에서 그리는 화면이다(`"use client"`를 붙이지 않는다). 판단은 하지 않고 `parseShare`의 결과를 그린다.

- `generateMetadata({ params, searchParams }: PageProps<"/s/[placeNo]">)`: `parseShare`가 null이면 `notFound()`. 아니면 `shareMetadata(shareTitle(share.cuisineLabel), 경로)`. 경로는 종류를 알면 `sharePath(share.placeNo, share.cuisineId)`, 모르면 `/s/{placeNo}`(주소에 온 모르는 종류 값을 대표 주소에 옮겨 적지 않는다).
- 화면 함수: 같은 방식으로 읽고, null이면 `notFound()`.
- 배치(위에서 아래로, 바깥 상자는 화면 높이에 고정 `h-dvh flex flex-col`, 바깥 화면은 스크롤되지 않는다):
  1. 서비스 이름 `SITE_NAME`: 작은 글자(`text-base text-muted`), 가운데.
  2. 머리글: 종류를 알면 작은 줄 `오늘은`과 `<h1>`에 종류 이름, 모르면 `<h1>오늘 점심, 여기 어때요?</h1>`.
  3. 가게 페이지: `<iframe src={share.placeUrl} title="카카오 가게 페이지" sandbox={SHEET_SANDBOX} className="sheet-frame" />`. `sheet-frame`은 이미 `flex: 1; min-height: 0`이라 남은 높이를 차지하고 그 안에서 스크롤된다. 테두리는 `border border-line rounded-xl overflow-hidden`인 상자로 감싼다.
  4. 버튼 둘(세로로, 가로 가득): `<a href={share.placeUrl} target="_blank" rel="noreferrer noopener" className="btn btn-quiet">카카오에서 열기</a>`, 그 아래 `<Link href="/" className="btn btn-primary">나도 뽑아 보기</Link>`.
  5. `<VisitBeacon />`(아무것도 그리지 않는다).
- 여백과 글자 크기는 `StartScreen.tsx`·`ResultScreen.tsx`가 쓰는 값에 맞춘다.
- 파일 주석에 "버튼이 항상 보여야 하는 이유"(유입이 `나도 뽑아 보기` 하나에 달려 있다)와 "`카카오에서 열기`를 항상 두는 이유"(`PlaceSheet.tsx`의 주석과 같은 이유)를 적는다.

- [ ] **Step 3: 빌드와 타입 검사**

Run: `cd web && npm run build && npx tsc --noEmit && npm run lint`
Expected: 모두 통과. 빌드 출력의 경로 목록에 `/s/[placeNo]`가 요청마다 그려지는 경로(ƒ)로 나온다.

- [ ] **Step 4: 정식 빌드를 띄운다**

Run: `cd web && npm start` (백그라운드, 포트 3000)

- [ ] **Step 5: 응답을 확인한다**

```bash
curl -s 'http://localhost:3000/s/12345678?c=donkatsu' > /tmp/share.html
grep -o '<title>[^<]*</title>' /tmp/share.html          # <title>오늘은 돈까스·우동</title>
grep -o '<meta name="robots"[^>]*>' /tmp/share.html     # content에 noindex, nofollow
grep -o '<meta property="og:image"[^>]*>' /tmp/share.html   # opengraph-image 주소가 있다
grep -o '<link rel="canonical"[^>]*>' /tmp/share.html   # .../s/12345678?c=donkatsu
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/s/abc'   # 404
curl -s 'http://localhost:3000/s/12345678?c=nope' | grep -o '<title>[^<]*</title>'   # <title>오늘 점심, 여기 어때요?</title>
```

`/tmp` 대신 이 세션의 scratchpad 디렉터리를 쓴다. **`og:image`가 나오지 않으면** `shareMetadata`의 `openGraph`에 `images: ["/opengraph-image.png"]`를 더하고 Task 2의 시험에 그 항목을 더한 뒤 다시 확인한다(화면이 `openGraph`를 내면 위쪽의 파일 기반 그림까지 떨어지는지는 문서만으로 확정하지 못했다).

- [ ] **Step 6: 화면을 눈으로 확인한다**

브라우저에서 `http://localhost:3000/s/12345678?c=donkatsu`를 폭 320px과 390px(높이 700px 안팎)로 연다. 실제 가게를 보려면 카카오맵에서 아무 가게의 장소 번호를 가져와 넣는다.

- 머리글, `카카오에서 열기`, `나도 뽑아 보기`가 스크롤 없이 모두 보인다.
- 가게 페이지가 그 사이에서 따로 스크롤된다. 바깥 화면은 스크롤되지 않는다.
- `나도 뽑아 보기`를 누르면 시작 화면이 열린다.
- `?c=nope`에서는 머리글이 `오늘 점심, 여기 어때요?`다.

확인이 끝나면 `npm start`를 멈춘다.

- [ ] **Step 7: 커밋**

```bash
git add 'web/app/s/[placeNo]/page.tsx' web/lib/site.ts web/lib/site.test.ts
git commit -m "feat(web): 받은 사람이 가게와 음식 종류를 바로 보는 공유 화면을 더한다"
```

---

### Task 4: 결과 화면의 `보내기`

**쓸 스킬:** `superpowers:test-driven-development`(판단 부분), `vercel-react-best-practices`, `vercel-composition-patterns`

**Files:**
- Modify: `web/lib/share.ts`, `web/lib/share.test.ts`
- Create: `web/components/ShareButton.tsx`
- Modify: `web/components/ResultScreen.tsx` (속성 목록 11행 근처, "맛있게 드세요" 상자 387~400행 근처)
- Modify: `web/app/page.tsx` (656행 근처)

**Interfaces:**
- Consumes: `placeNumber`, `sharePath`, `shareText` (Task 1)
- Produces:
  - `type ShareOutcome = "shared" | "cancelled" | "copied" | "failed"`
  - `type ShareDeps = { share?: (data: { text: string; url: string }) => Promise<void>; copy?: (text: string) => Promise<void> }`
  - `sendShare(text: string, url: string, deps: ShareDeps): Promise<ShareOutcome>`
  - `ShareButton` 속성: `{ text: string; path: string }`
  - `ResultScreen`의 새 속성: `cuisineId: string`

- [ ] **Step 1: 실패하는 시험을 더한다** (`web/lib/share.test.ts` 끝)

```ts
describe("보내기", () => {
  const text = "오늘은 분식, 가게 어때요?";
  const url = "https://a.example/s/1?c=bunsik";
  const abort = () => Object.assign(new Error("닫음"), { name: "AbortError" });

  it("공유 창이 있으면 글과 주소를 넘긴다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const copy = vi.fn();
    expect(await sendShare(text, url, { share, copy })).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text, url });
    expect(copy).not.toHaveBeenCalled();
  });
  it("닫으면 아무것도 하지 않는다", async () => {
    const copy = vi.fn();
    expect(await sendShare(text, url, { share: () => Promise.reject(abort()), copy })).toBe("cancelled");
    expect(copy).not.toHaveBeenCalled();
  });
  it("공유가 거절되면 복사한다", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const share = () => Promise.reject(new Error("NotAllowed"));
    expect(await sendShare(text, url, { share, copy })).toBe("copied");
    expect(copy).toHaveBeenCalledWith(`${text}\n${url}`);
  });
  it("공유 창이 없으면 글과 주소를 한 줄씩 복사한다", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    expect(await sendShare(text, url, { copy })).toBe("copied");
    expect(copy).toHaveBeenCalledWith(`${text}\n${url}`);
  });
  it("복사도 안 되면 failed다", async () => {
    expect(await sendShare(text, url, { copy: () => Promise.reject(new Error("x")) })).toBe("failed");
    expect(await sendShare(text, url, {})).toBe("failed");
  });
});
```

`import`에 `vi`와 `sendShare`를 더한다.

- [ ] **Step 2: 실패 확인**

Run: `cd web && npx vitest run lib/share.test.ts`
Expected: FAIL (`sendShare`가 없음)

- [ ] **Step 3: `sendShare`를 `web/lib/share.ts`에 만든다**

닫은 것인지는 오류의 `name`이 `"AbortError"`인지로 가린다. 그 밖의 공유 실패는 복사로 넘어간다.

- [ ] **Step 4: 통과 확인**

Run: `cd web && npx vitest run lib/share.test.ts`
Expected: PASS

- [ ] **Step 5: `web/components/ShareButton.tsx`를 만들고 결과 화면에 넣는다**

- `ShareButton`은 `"use client"` 컴포넌트다. 누르면 `sendShare(text, window.location.origin + path, deps)`를 부른다. `deps`는 누르는 순간에 만든다: `navigator.share`가 함수이면 `share`로, `navigator.clipboard?.writeText`가 있으면 `copy`로(둘 다 `navigator`에 묶어서 넘긴다).
- 결과별 화면: `shared`·`cancelled`는 아무 변화 없음. `copied`는 버튼 아래에 `복사했어요`. `failed`는 주소를 글자로 보여 주고 길게 눌러 복사하라고 알린다(문구와 모양은 `InstallGuide.tsx`의 복사 실패 안내를 따른다). 알림에는 `role="status"`를 준다.
- 버튼: `<button type="button" className="btn btn-quiet btn-sm">보내기</button>`.
- `ResultScreen`: 속성에 `cuisineId: string`을 더한다. "맛있게 드세요" 상자 안에서, 방금 정한 가게(`justDecidedId`와 같은 `id`를 `places`에서 찾는다)의 `placeNumber(place.placeUrl)`이 null이 아닐 때만 `기록 보기` 앞에 `<ShareButton text={shareText(cuisine, place.name)} path={sharePath(번호, cuisineId)} />`를 그린다. 두 버튼은 한 줄에 나란히 둔다(`flex gap-3`), 좁으면 접힌다(`flex-wrap`).
- 상자 위 주석의 "가게 이름은 넣지 않는다" 설명은 상자의 글에 대한 것이므로 그대로 두고, `보내기`가 왜 이 자리에 있는지(방금 정한 순간이 보내기에 가장 자연스럽다, 가게 페이지 주소가 없는 가게에는 쓸모없는 링크를 만들지 않으려고 숨긴다) 한 문단을 더한다.
- `web/app/page.tsx`: `<ResultScreen`에 `cuisineId={view.cuisine.id}`를 더한다.

- [ ] **Step 6: 빌드·타입·린트·전체 시험**

Run: `cd web && npm run build && npx tsc --noEmit && npm run lint && npm test`
Expected: 모두 통과.

- [ ] **Step 7: 실제 화면으로 확인한다**

Run: 저장소 맨 위에서 `just dev` (카카오 열쇠가 든 `api/.env`가 필요하다. 이 worktree에 없으면 원래 저장소의 `api/.env`를 복사한다. 이 파일은 커밋하지 않는다)

데스크톱 브라우저(공유 창이 없다)에서:

- 음식 종류를 고르고 한 곳에서 `여기로 정했어요`를 누르면 "맛있게 드세요" 상자에 `보내기`와 `기록 보기`가 나란히 보인다.
- `보내기`를 누르면 `복사했어요`가 뜨고, 붙여 넣으면 첫 줄이 `오늘은 {종류}, {가게} 어때요?`, 둘째 줄이 `http://localhost:3000/s/{숫자}?c={종류 식별자}`다.
- 그 주소를 새 탭에 열면 방금 정한 가게의 카카오 페이지와 같은 종류 이름이 보인다.
- 기존 동작(`다른 가게 보기`, `이전 가게`, `다른 종류 고르기`, 가게 이름을 눌러 창 열기, 홈 화면 추가 안내)이 전과 같다.

- [ ] **Step 8: 커밋**

```bash
git add web/lib/share.ts web/lib/share.test.ts web/components/ShareButton.tsx web/components/ResultScreen.tsx web/app/page.tsx
git commit -m "feat(web): 한 곳을 정한 직후 그 가게를 보내는 버튼을 더한다"
```

---

### Task 5: 문서, 리뷰, 최종 확인

**쓸 스킬:** `/code-review`(React·Next.js 코드는 `vercel-react-best-practices` 기준 포함), `web-design-guidelines`, `superpowers:verification-before-completion`

**Files:**
- Modify: `README.md`, `PRODUCT.md`, `docs/todo.md`

- [ ] **Step 1: 문서를 고친다** (설계 문서 6-7절)

- `README.md`:
  - "화면 다섯 개" 절의 제목과 그림에 공유 화면을 더하고, ④ 결과 화면 그림 아래에 `보내기` 설명을 더한다.
  - 새 절 "정한 가게 보내기": 왜 있는가(점심은 여럿이 먹고, 보내는 순간이 새 사람이 이 서비스를 알게 되는 길이다) → 링크의 모양과 검사 → 받는 화면 → 알려진 한계(안드로이드 카카오톡 미확인, 그래서 `카카오에서 열기`를 항상 둔다) 순서로 적는다.
  - "음식 종류 식별자는 일부러 뺐습니다" 문단 뒤에, 이 식별자가 이제 공유 링크에 담겨 서비스 밖으로 나간다는 사실과 운영자가 알고 고른 결정임을 적는다(설계 문서 6-6절).
  - "아직 없는 것들"의 요청 빈도 제한 문장 뒤에 "2026-11-26에 운영자가 아직은 걸지 않기로 정했다"와 그 이유(한도가 다 차도 요금은 나가지 않고 그날 음식점 찾기만 멈춘다, 사용자가 거의 없다)를 덧붙인다.
  - 폴더 구조 그림에 새 파일을 더한다.
- `PRODUCT.md`: "화면은 다섯 개입니다" 문장을 여섯 개로 고치고 공유 화면을 더한다.
- `docs/todo.md`: 4번 후보의 1단계(링크 공유)를 끝난 것으로 표시하고, 실제로 만든 것이 처음 기록(카카오맵 주소를 보낸다)과 달리 우리 공유 화면 주소를 보낸다는 점을 적는다. "이 결정이 바꾸지 않는 것" 절의 마지막 문장과 4번 후보의 "선행 조건" 두 곳에 요청 빈도 제한을 걸지 않기로 한 결정과 날짜(2026-11-26)를 적는다.

- [ ] **Step 2: 잔재 검사**

Run: `grep -rn "화면은 다섯 개\|화면 다섯 개" PRODUCT.md README.md`
Expected: 결과 없음.

- [ ] **Step 3: 문서 커밋**

```bash
git add README.md PRODUCT.md docs/todo.md
git commit -m "docs: 정한 가게 보내기와 공유 화면, 요청 빈도 제한을 미룬 결정을 적는다"
```

- [ ] **Step 4: 코드 리뷰와 접근성 감사**

`/code-review`를 돌리고(실행 방식에 작업별 리뷰가 들어 있으면 그것으로 갈음한다), `web-design-guidelines` 스킬로 `web/app/s/[placeNo]/page.tsx`, `web/components/ShareButton.tsx`, `web/components/ResultScreen.tsx`의 바뀐 부분을 감사한다. 받아들인 지적은 고치고 해당 Task의 확인을 다시 돌린다.

- [ ] **Step 5: 플랜 전체 완료 조건을 확인한다**

Run: 저장소 맨 위에서 `just check`
Expected: 통과. 이 문서 맨 위 "완료 조건"의 각 줄을 다시 읽고, 명령을 실제로 돌려 출력을 확인한 것만 통과로 적는다.

- [ ] **Step 6: 운영자에게 넘길 확인 목록을 전한다** (배포 뒤, 휴대폰 필요)

- 아이폰에서 `보내기`로 카카오톡에 보냈을 때 글과 링크가 모두 도착하는가. 글이 빠진다면 주소를 글 안에 넣는 방식으로 `sendShare`의 공유 창 갈래를 고친다.
- 받은 링크를 카카오톡에서 눌렀을 때 공유 화면에 가게 페이지와 두 버튼이 보이는가.
- 대화방의 링크 미리보기에 제목과 그림이 뜨는가.
- 안드로이드 카카오톡에서도 같은가(가능할 때).
