# 홈 화면에 추가해서 앱처럼 열기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서비스를 휴대폰 홈 화면에 아이콘으로 추가할 수 있게 하고, 한 곳을 정한 직후와 시작 화면에서 추가하는 방법을 안내한다.

**Architecture:** Next.js에 내장된 `app/manifest.ts` 규칙으로 앱 정보 파일을 내보내고, 아이콘은 미리 만든 그림 파일로 둔다. 서비스 워커는 두지 않는다. "지금 어떤 기기 상황인가"와 "안내를 닫았는가"는 `web/lib/install.ts`의 순수 함수가 판정하고, 브라우저의 설치 신호(`beforeinstallprompt`)는 `web/app/page.tsx`가 한 번 받아 들고 있다가 결과 화면과 시작 화면에 내려 준다. 두 화면은 같은 안내 상자 부품 `InstallGuide`를 쓴다.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, Tailwind 4, vitest(node 환경). 새 의존성 없음(아이콘 변환에는 Next.js가 이미 데려온 `sharp` 0.35.4를 쓴다).

**Spec:** `docs/superpowers/specs/2026-11-19-home-screen-install-design.md`

**완료조건(플랜 전체):** `cd web && npm test && npm run lint && npm run build`가 모두 통과하고, 빌드 출력에 `/manifest.webmanifest`가 있으며, 390×844 브라우저에서 Task 3·4의 확인 항목이 전부 맞고, 문서 세 개가 갱신되어 있다. 실제 기기 확인(맨 끝 절)은 사람이 배포한 뒤에 한다.

## Global Constraints

- 새 npm 패키지를 설치하지 않는다. 서비스 워커를 만들지 않는다.
- `localStorage`에 새로 더하는 것은 열쇠 `random-choice.install-dismissed.v1` 하나뿐이다. 기록(`random-choice.visits.v1`)·회피 설정(`random-choice.avoid.v1`)과 섞지 않는다.
- 카카오 조회 결과나 `/api` 응답을 어디에도 저장하지 않는다.
- 이름은 `name`과 `short_name` 모두 `오늘은 뭐 먹지?`다. 줄이지 않는다(사용자 결정).
- 화면 문구는 `~해요` 체이고, 설계 문서 6-2·6-3의 그림에 적힌 문구를 글자 그대로 쓴다.
- 글자는 나뭇결 위에 직접 놓지 않고 종이색 바닥(`bg-background`) 위에 둔다. 그림자·블러·그라데이션을 쓰지 않는다. 누를 수 있는 것은 최소 48px.
- 한 화면에 강조색으로 칠한 버튼(`btn-primary`)은 하나를 넘지 않는다. 시작 화면에는 이미 하나가 있으므로 그곳의 안내 상자 안 버튼은 `btn-quiet`다.
- 새 CSS 애니메이션을 더하지 않는다. 나타나는 움직임은 기존 `.rise`만 쓴다(`web/lib/motion.test.ts`가 대조한다).
- 누를 수 없는 상태는 `disabled`가 아니라 `aria-disabled`로 나타낸다.
- 눌러도 아무 일도 일어나지 않는 버튼·링크를 보여 주지 않는다.
- Next.js 관련 코드를 쓰기 전에 `web/node_modules/next/dist/docs/`의 해당 안내서를 읽는다(`web/AGENTS.md`). 이 플랜이 근거로 삼은 것은 `01-app/02-guides/progressive-web-apps.md`, `01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`, 같은 폴더의 `app-icons.md`다.
- 커밋 메시지는 이 저장소의 관례(`feat(web): …한다`, `docs: …적는다`)를 따른다. 작업 브랜치는 이미 만들어 둔 `feat/home-screen-install`이다.

## Review Focus

1. **아이패드가 자신을 Mac이라고 알리는 경우**(`Macintosh` + 터치 지점 2개 이상) → 아이폰과 같은 순서 안내가 나와야 한다. (Task 1 시험)
2. **아이폰의 카카오톡 안에서 열린 경우** → 아이폰 순서 안내가 아니라 "여기서는 추가할 수 없어요"가 나와야 한다. (Task 1 시험)
3. **저장소가 막혔거나 저장된 값이 엉뚱한 글자인 경우** → 예외 없이 "닫지 않음"으로 읽고, 쓰기도 예외를 던지지 않아야 한다. (Task 1 시험)
4. **설치 확인 창을 한 번 띄운 뒤** → 브라우저의 설치 신호는 다시 쓸 수 없으므로, 그 방문 동안 상자와 링크가 사라져야 한다. 눌러도 반응 없는 버튼이 남으면 안 된다. (Task 1 시험 `hasPrompt: false`, Task 3·4 브라우저 확인)
5. **이미 홈 화면에서 연 상태에서 설치 신호가 함께 온 경우** → 아무것도 보이지 않아야 한다. (Task 1 시험)

---

### Task 1: 기기 판별과 닫음 표시

**완료조건:** `cd web && npx vitest run lib/install.test.ts`가 전부 통과한다.

**쓸 스킬:** `superpowers:test-driven-development`

**Files:**
- Create: `web/lib/install.ts`
- Create: `web/lib/install.test.ts`

**Interfaces:**
- Consumes: `Store` (`web/lib/visits.ts`)
- Produces:

```ts
export type InstallEnv = {
  userAgent: string;
  /** 홈 화면에서 열렸는지. display-mode: standalone 이거나 navigator.standalone === true */
  standalone: boolean;
  maxTouchPoints: number;
  /** 브라우저의 설치 신호를 받아 들고 있고 아직 쓰지 않았는지 */
  hasPrompt: boolean;
};
export type InstallKind = "installed" | "in-app" | "prompt" | "ios" | "none";
export type OfferKind = "in-app" | "prompt" | "ios";
export type InstallOrigin = "result" | "start";
/** lib.dom에 없는 beforeinstallprompt 이벤트의 모양 */
export type InstallPromptEvent = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export const IN_APP_MARKERS: readonly string[];
export const INSTALL_DISMISSED_KEY = "random-choice.install-dismissed.v1";
export function installKind(env: InstallEnv): InstallKind;
export function isOfferKind(kind: InstallKind): kind is OfferKind;
export function recordsDismissal(origin: InstallOrigin, outcome: "accepted" | "dismissed"): boolean;
export function readInstallDismissed(store: Store | null): boolean;
export function writeInstallDismissed(store: Store | null): void;
```

- [ ] **Step 1: 실패하는 시험을 쓴다** (`web/lib/install.test.ts`). `describe`·`it`·`expect`는 기존 시험처럼 `vitest`에서 직접 가져온다(Task 2의 시험도 같다). 시험용 저장소는 `web/lib/visits.test.ts`의 `fakeStore`·`throwingStore`와 같은 모양으로 이 파일 안에 둔다.

```ts
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const env = (over: Partial<InstallEnv>): InstallEnv =>
  ({ userAgent: ANDROID, standalone: false, maxTouchPoints: 5, hasPrompt: false, ...over });

describe("installKind", () => {
  it("홈 화면에서 열렸으면 다른 조건과 무관하게 installed", () => {
    expect(installKind(env({ standalone: true, hasPrompt: true }))).toBe("installed");
    expect(installKind(env({ standalone: true, userAgent: IPHONE }))).toBe("installed");
  });
  it("설치 신호를 들고 있으면 prompt", () => {
    expect(installKind(env({ hasPrompt: true }))).toBe("prompt");
  });
  it("설치 신호가 없거나 이미 쓴 안드로이드는 none", () => {
    expect(installKind(env({ hasPrompt: false }))).toBe("none");
  });
  it("아이폰은 ios", () => {
    expect(installKind(env({ userAgent: IPHONE }))).toBe("ios");
  });
  it("Mac이라고 알리지만 터치 지점이 둘 이상이면 아이패드로 보아 ios", () => {
    expect(installKind(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe("ios");
  });
  it("터치가 없는 진짜 Mac은 none", () => {
    expect(installKind(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }))).toBe("none");
  });
  it.each(IN_APP_MARKERS)("다른 앱 안에서 열렸으면(%s) 아이폰이어도 in-app", (marker) => {
    expect(installKind(env({ userAgent: `${IPHONE} ${marker}` }))).toBe("in-app");
    expect(installKind(env({ userAgent: `${ANDROID} ${marker}` }))).toBe("in-app");
  });
  it("판별 목록에 카카오톡이 들어 있다", () => {
    expect(IN_APP_MARKERS).toContain("KAKAOTALK");
  });
});

describe("isOfferKind", () => {
  it("안내를 보여 줄 상황은 셋뿐이다", () => {
    expect((["installed", "in-app", "prompt", "ios", "none"] as const).filter(isOfferKind))
      .toEqual(["in-app", "prompt", "ios"]);
  });
});

describe("recordsDismissal", () => {
  it("결과 화면에서 설치 확인 창을 취소했을 때만 닫음으로 남긴다", () => {
    expect(recordsDismissal("result", "dismissed")).toBe(true);
    expect(recordsDismissal("result", "accepted")).toBe(false);
    expect(recordsDismissal("start", "dismissed")).toBe(false);
    expect(recordsDismissal("start", "accepted")).toBe(false);
  });
});

describe("닫음 표시", () => {
  it("쓰기 전에는 false, 쓴 뒤에는 true", () => {
    const store = fakeStore();
    expect(readInstallDismissed(store)).toBe(false);
    writeInstallDismissed(store);
    expect(readInstallDismissed(store)).toBe(true);
    expect(Object.keys(store.data)).toEqual([INSTALL_DISMISSED_KEY]);
  });
  it("엉뚱한 값이 들어 있으면 false", () => {
    expect(readInstallDismissed(fakeStore({ [INSTALL_DISMISSED_KEY]: "{깨짐" }))).toBe(false);
  });
  it("저장소가 없거나 예외를 던져도 조용히 넘어간다", () => {
    expect(readInstallDismissed(null)).toBe(false);
    expect(readInstallDismissed(throwingStore())).toBe(false);
    expect(() => writeInstallDismissed(null)).not.toThrow();
    expect(() => writeInstallDismissed(throwingStore())).not.toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다.** Run: `cd web && npx vitest run lib/install.test.ts` → Expected: `./install`을 찾지 못해 FAIL.

- [ ] **Step 3: `web/lib/install.ts`를 만든다.** 정해 둔 것:
  - 판정 순서는 `installed` → `in-app` → `prompt` → `ios` → `none`이다. 앞의 것이 맞으면 뒤는 보지 않는다.
  - `IN_APP_MARKERS = ["KAKAOTALK", "NAVER(inapp", "DaumApps", "Instagram", "FBAN", "FBAV", "Line/"]`. `userAgent`에 이 글자 중 하나가 그대로 들어 있으면 `in-app`이다. 이 목록은 기억에 기대어 적은 것이라 파일 주석에 "실제 기기로 확인한 것은 카카오톡뿐"이라고 남긴다(확인은 맨 끝 절).
  - `ios`는 `userAgent`가 `/iPad|iPhone|iPod/`에 맞거나, `Macintosh`를 담고 `maxTouchPoints > 1`인 경우다.
  - 닫음 표시는 값 `"1"`로 쓰고, 읽을 때 정확히 `"1"`일 때만 `true`다.
  - 저장소 접근은 `web/lib/visits.ts`의 `readAvoidOn`·`writeAvoidOn`처럼 `try/catch`로 감싼다.
  - 열쇠 주석에 "기록·회피 설정과 다른 열쇠를 쓰는 까닭"(사용자가 만든 설정이지 카카오 조회 결과가 아니다)을 `AVOID_KEY` 주석과 같은 결로 적는다.

- [ ] **Step 4: 통과를 확인한다.** Run: `cd web && npx vitest run lib/install.test.ts` → Expected: 전부 PASS.

- [ ] **Step 5: 커밋한다.**

```bash
git add web/lib/install.ts web/lib/install.test.ts
git commit -m "feat(web): 홈 화면 추가 안내를 보여 줄 기기 상황을 판별한다"
```

---

### Task 2: 앱 정보 파일과 아이콘

**완료조건:** `cd web && npx vitest run app/manifest.test.ts`가 통과하고, `npm run build` 출력의 경로 목록에 `/manifest.webmanifest`와 `/apple-icon.png`가 있다.

**Files:**
- Create: `web/assets/app-icon.svg` (원본 그림)
- Create: `web/assets/app-icon-maskable.svg` (가장자리가 잘려도 되는 판)
- Create: `web/scripts/make-icons.mjs`
- Create: `web/public/icon-192.png`, `web/public/icon-512.png`, `web/public/icon-maskable-512.png`
- Create: `web/app/apple-icon.png` (180×180. Next.js가 이 이름을 보고 아이폰용 `<link>`를 스스로 넣는다)
- Create: `web/app/manifest.ts`
- Create: `web/app/manifest.test.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/apple-icon.png`

- [ ] **Step 1: 실패하는 시험을 쓴다** (`web/app/manifest.test.ts`).

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "./manifest";

/** PNG 머리(IHDR)에서 가로·세로를 읽는다. 16~23번째 바이트가 그 값이다. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(join(__dirname, "..", path));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("앱 정보 파일", () => {
  const m = manifest();
  it("이름을 줄이지 않는다", () => {
    expect(m.name).toBe("오늘은 뭐 먹지?");
    expect(m.short_name).toBe("오늘은 뭐 먹지?");
  });
  it("주소창 없이 시작 화면부터 연다", () => {
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("ko");
  });
  it("켜지는 동안의 바탕은 나무색이다", () => {
    expect(m.background_color).toBe("#e8d6b4");
    expect(m.theme_color).toBe("#e8d6b4");
  });
  it("아이콘 셋을 알린다", () => {
    expect(m.icons).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
  it("알린 크기와 실제 그림 파일의 크기가 같다", () => {
    expect(pngSize("public/icon-192.png")).toEqual([192, 192]);
    expect(pngSize("public/icon-512.png")).toEqual([512, 512]);
    expect(pngSize("public/icon-maskable-512.png")).toEqual([512, 512]);
    expect(pngSize("app/apple-icon.png")).toEqual([180, 180]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다.** Run: `cd web && npx vitest run app/manifest.test.ts` → Expected: `./manifest`를 찾지 못해 FAIL.

- [ ] **Step 3: 원본 그림 둘을 만든다.**
  - `web/assets/app-icon.svg`: 설계 문서 6-5의 SVG를 그대로 옮긴다(`viewBox="0 0 104 104"`, `xmlns` 속성을 더한다). 사용자가 고른 스케치이므로 모양·색을 바꾸지 않는다. 다듬는 것은 선 굵기와 비율까지다.
  - `web/assets/app-icon-maskable.svg`: 바탕 `<rect>`는 그대로 꽉 채우고, 나머지 그림을 `<g transform="translate(52 52) scale(0.8) translate(-52 -52)">`로 감싸 가운데로 모은다. 안드로이드가 원으로 잘라도 그릇과 얼굴이 남게 하기 위한 것이다.
  - 두 그림 모두 바탕이 투명하면 안 된다(아이폰은 투명한 자리를 검게 칠한다).

- [ ] **Step 4: `web/scripts/make-icons.mjs`를 만들어 한 번 돌린다.** `sharp`로 위 두 SVG를 PNG 넷으로 바꾼다: `app-icon.svg` → `public/icon-192.png`(192), `public/icon-512.png`(512), `app/apple-icon.png`(180), `app-icon-maskable.svg` → `public/icon-maskable-512.png`(512). SVG는 `sharp(path, { density: 600 })`처럼 넉넉한 밀도로 읽어 흐려지지 않게 한다. 파일 맨 위 주석에 "그림을 고친 뒤 `node scripts/make-icons.mjs`를 다시 돌린다. `sharp`는 Next.js가 데려온 것을 빌려 쓴다"라고 적는다.

  Run: `cd web && node scripts/make-icons.mjs && ls -la public/icon-*.png app/apple-icon.png`
  Expected: 파일 넷이 있고 크기가 0이 아니다.

- [ ] **Step 5: 만든 그림을 눈으로 확인한다.** `web/public/icon-512.png`와 `web/public/icon-maskable-512.png`를 Read 도구로 열어, 웃는 얼굴의 밥그릇이 보이고 잘린 판에서 그릇이 가운데 80% 안에 들어 있는지 본다.

- [ ] **Step 6: `web/app/manifest.ts`를 만든다.** `export default function manifest(): MetadataRoute.Manifest`. Step 1의 값에 더해 `description`은 `web/app/layout.tsx`의 `metadata.description`과 같은 문장 "주변 음식점을 보고 무엇을 먹을지 대신 정해 드립니다."를 쓴다. 주석에 두 가지를 적는다: (1) `background_color`·`theme_color`는 `globals.css`의 `--wood-color`·`layout.tsx`의 `themeColor`와 같은 값이라 색을 바꿀 때 세 곳을 같이 본다, (2) 이름과 아이콘은 설치하는 순간 기기에 굳으므로 가볍게 바꾸지 않는다.

- [ ] **Step 7: 통과와 빌드를 확인한다.**

  Run: `cd web && npx vitest run app/manifest.test.ts` → Expected: PASS.
  Run: `cd web && npm run build` → Expected: 성공하고 경로 목록에 `/manifest.webmanifest`와 `/apple-icon.png`가 있다.

- [ ] **Step 8: 커밋한다.**

```bash
git add web/assets web/scripts web/public/icon-192.png web/public/icon-512.png web/public/icon-maskable-512.png web/app/apple-icon.png web/app/manifest.ts web/app/manifest.test.ts
git commit -m "feat(web): 홈 화면에 추가할 수 있도록 앱 정보 파일과 밥그릇 아이콘을 더한다"
```

---

### Task 3: 안내 상자 부품과 결과 화면 연결

**완료조건:** `cd web && npm test && npm run lint`가 통과하고, 아래 Step 6의 브라우저 확인 항목이 전부 맞다.

**쓸 스킬:** 화면 코드를 쓰기 전에 `vercel:react-best-practices`를 읽는다.

**Files:**
- Create: `web/components/InstallGuide.tsx`
- Modify: `web/app/page.tsx` (`Home` 안의 상태 선언부, 첫 `useEffect` 근처, `<ResultScreen …>` 호출부)
- Modify: `web/components/ResultScreen.tsx` (`Props`, "맛있게 드세요" 상자 바로 아래)

**Interfaces:**
- Consumes: Task 1의 `installKind`, `isOfferKind`, `recordsDismissal`, `readInstallDismissed`, `writeInstallDismissed`, `InstallKind`, `OfferKind`, `InstallOrigin`, `InstallPromptEvent`
- Produces:

```ts
// web/components/InstallGuide.tsx
type Props = {
  kind: OfferKind;
  /** offer: 결과 화면. 권유 문구와 버튼을 먼저 보여 준다. direct: 시작 화면. 방법을 곧바로 보여 준다. */
  variant: "offer" | "direct";
  /** kind가 "prompt"일 때 버튼이 부른다. 브라우저의 설치 확인 창을 띄우는 일은 부모가 한다. */
  onInstall: () => void;
  onClose: () => void;
};
export default function InstallGuide(props: Props): React.JSX.Element;

// web/app/page.tsx 안에서 만들어 두 화면에 내려 주는 값 (Task 4도 쓴다)
const kind: InstallKind;                         // 마운트 뒤에 계산. 그 전에는 "none"
const installDismissed: boolean;
function requestInstall(origin: InstallOrigin): void;
function dismissInstall(): void;

// web/components/ResultScreen.tsx의 Props에 더하는 것
installKind: InstallKind;
installDismissed: boolean;
onInstall: () => void;
onDismissInstall: () => void;
```

- [ ] **Step 1: `web/components/InstallGuide.tsx`를 만든다.** 내용은 `variant`와 `kind`, 그리고 "펼쳤는가"(부품 안의 상태 하나)로 정해진다.

  | variant | kind | 처음 보이는 것 | 버튼을 누르면 |
  |---|---|---|---|
  | `offer` | 셋 모두 | 제목 `내일도 오실 건가요?`, 설명 `홈 화면에 추가해 두면 브라우저를 열지 않고 바로 시작할 수 있어요`, 버튼 `홈 화면에 추가하기`(`btn btn-primary btn-sm`) | `prompt`: `onInstall()`을 부른다. `ios`·`in-app`: 버튼 자리가 아래 "방법" 내용으로 바뀐다 |
  | `direct` | `ios`·`in-app` | 제목 `홈 화면에 추가하기`와 아래 "방법" 내용이 곧바로 | — |

  "방법" 내용:
  - `ios`: 설명 `브라우저를 열지 않고 바로 시작할 수 있어요`(`direct`에서만. `offer`에서는 위 설명이 이미 있다)와 번호 목록 `<ol>` — `화면 아래의 공유 버튼을 눌러요` / `목록을 내려 홈 화면에 추가를 눌러요`(`홈 화면에 추가`는 `<strong>`) / `오른쪽 위의 추가를 눌러요`(`추가`는 `<strong>`).
  - `in-app`: 문장 `여기서는 추가할 수 없어요. 먼저 Safari나 Chrome에서 이 페이지를 열어 주세요.`, 그 아래 주소 글자(`window.location.host`, 길게 눌러 복사할 수 있게 `select-all`), 버튼 `주소 복사하기`. 버튼은 `navigator.clipboard.writeText(window.location.origin)`을 부르고, 성공하면 글자가 `복사했어요`로 바뀌며, 실패하면 버튼 아래에 `복사하지 못했어요. 위 주소를 길게 눌러 복사해 주세요`를 보인다. 버튼 클래스는 `variant`가 `offer`면 `btn btn-primary btn-sm`, `direct`면 `btn btn-quiet btn-sm`이다(시작 화면에는 강조색 버튼이 이미 있다).

  모양과 접근성:
  - 바깥은 `<section aria-labelledby=…>`에 `rise relative flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-background px-4 py-4 text-center`. 제목은 `<h3>`(18px, 600)이고 `tabIndex={-1}`.
  - 닫기는 오른쪽 위의 `<button type="button" aria-label="닫기">✕</button>`이고 누를 수 있는 넓이가 48px 이상이다. 제목 글자와 겹치지 않게 제목 쪽에 좌우 여백을 준다.
  - `variant`가 `direct`이면 처음 그려질 때 제목으로 초점을 옮긴다(시작 화면에서 링크가 사라지며 초점이 `body`로 떨어지는 것을 막는다). `offer`에서 "방법"이 펼쳐질 때도 제목으로 옮긴다. `offer`가 처음 나타날 때는 옮기지 않는다 — 그 순간의 초점은 `정하신 곳`에 있어야 한다(`ResultScreen.tsx`의 `markRef` 주석).
  - `"use client"`가 필요하다(상태와 `navigator`를 쓴다).

- [ ] **Step 2: `web/app/page.tsx`에 설치 상태를 더한다.**
  - 상태: `const [kind, setKind] = useState<InstallKind>("none")`, `const [installDismissed, setInstallDismissed] = useState(false)`, 그리고 설치 신호를 들고 있을 `useRef<InstallPromptEvent | null>(null)`.
  - 지금 환경을 읽어 `installKind()`에 넘기는 작은 함수를 하나 둔다. `standalone`은 `window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true`, `hasPrompt`는 위 ref가 비어 있지 않은지다.
  - 마운트 뒤의 `useEffect` 하나에서: `kind`와 `installDismissed`(`readInstallDismissed(store)`)를 채우고, `window`에 두 이벤트를 건다. `beforeinstallprompt` → `preventDefault()` 뒤 ref에 담고 `kind`를 다시 계산한다. `appinstalled` → ref를 비우고 `kind`를 다시 계산한다. 정리 함수에서 두 이벤트를 뗀다. 기존 `useEffect`의 `set-state-in-effect` 예외 주석과 같은 까닭(서버가 만든 화면과 첫 화면이 달라지면 안 된다)이므로 같은 방식으로 예외를 건다.
  - `requestInstall(origin)`: ref가 비어 있으면 아무것도 하지 않는다. 있으면 이벤트를 꺼내고 **ref를 먼저 비운 뒤** `kind`를 다시 계산하고(신호는 한 번만 쓸 수 있다), `prompt()`를 부르고 `userChoice`를 기다려 `recordsDismissal(origin, outcome)`이 참이면 `dismissInstall()`을 부른다.
  - `dismissInstall()`: `writeInstallDismissed(store)` 뒤 `setInstallDismissed(true)`.
  - `<ResultScreen>`에 `installKind={kind}`, `installDismissed={installDismissed}`, `onInstall={() => requestInstall("result")}`, `onDismissInstall={dismissInstall}`을 넘긴다.

- [ ] **Step 3: `web/components/ResultScreen.tsx`에 상자를 놓는다.** "맛있게 드세요" 상자(`closed ? (…) : null`) 바로 아래, 같은 `gap-5` 묶음 안에 둔다.

  ```tsx
  {closed && isOfferKind(installKind) && !installDismissed ? (
    <InstallGuide kind={installKind} variant="offer" onInstall={onInstall} onClose={onDismissInstall} />
  ) : null}
  ```

  주석에 까닭을 적는다: `closed`를 조건에 넣는 것은 기록이 실제로 남았을 때만 권하기 위해서이고(저장소가 막힌 브라우저에서는 닫음 표시도 남길 수 없다), 권하는 시점이 이때인 것은 서비스를 방금 써 본 직후이기 때문이다(설계 문서 6-1).

- [ ] **Step 4: 시험·린트·빌드를 돌린다.** Run: `cd web && npm test && npm run lint && npm run build` → Expected: 전부 통과.

- [ ] **Step 5: 개발 서버를 켠다.** Run: 저장소 루트에서 `just dev`(화면과 Go 서버를 함께 켠다. 카카오 열쇠가 필요하며 README "시작하기"에 절차가 있다).

- [ ] **Step 6: 브라우저(390×844)에서 확인한다.** 결과 화면까지 가서 `여기로 정했어요`를 누른다. 상황은 아래처럼 흉내 낸다.

  | 상황 | 흉내 내는 방법 | 기대하는 것 |
  |---|---|---|
  | 그 밖 | 아무것도 하지 않은 컴퓨터 브라우저 | "맛있게 드세요"만 보이고 새 상자는 없다 |
  | 아이폰 | 사용자 에이전트를 Task 1의 `IPHONE` 값으로 바꿔 다시 연다 | 새 상자가 "맛있게 드세요" 아래에 뜬다. `홈 화면에 추가하기`를 누르면 순서 셋이 펼쳐진다 |
  | 다른 앱 안 | 사용자 에이전트 끝에 ` KAKAOTALK`를 붙여 다시 연다 | 버튼을 누르면 "여기서는 추가할 수 없어요…"와 주소, `주소 복사하기`가 나온다 |
  | 설치 신호 | 콘솔에서 `window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) }))`를 실행한 뒤 정한다 | 상자가 뜬다. 버튼을 누르면 상자가 사라지고, 새로 고친 뒤 다시 정해도 나타나지 않는다(`localStorage`에 `random-choice.install-dismissed.v1`이 `1`) |
  | 닫기 | 아이폰 상황에서 `✕` | 상자가 사라지고, 다른 가게를 정해도 다시 나타나지 않는다 |

  함께 볼 것: 상자가 나타날 때 위의 제목·목록이 밀려 올라가지 않는다. 어두운 화면 설정에서도 글자가 읽힌다. Tab으로 `✕`와 버튼에 닿는다. 각 확인 뒤에는 `localStorage`의 닫음 열쇠를 지워 다음 확인에 섞이지 않게 한다.

- [ ] **Step 7: 커밋한다.**

```bash
git add web/components/InstallGuide.tsx web/components/ResultScreen.tsx web/app/page.tsx
git commit -m "feat(web): 한 곳을 정한 직후 홈 화면에 추가하라고 안내한다"
```

---

### Task 4: 시작 화면의 링크

**완료조건:** `cd web && npm test && npm run lint`가 통과하고, 아래 Step 3의 브라우저 확인 항목이 전부 맞다.

**쓸 스킬:** `vercel:react-best-practices`

**Files:**
- Modify: `web/components/StartScreen.tsx` (`Props`, 소개 글 상자, `최근 기록 보기` 버튼 주변)
- Modify: `web/app/page.tsx` (`<StartScreen …>` 호출부)

**Interfaces:**
- Consumes: Task 3의 `InstallGuide`, `kind`, `requestInstall`. Task 1의 `InstallKind`, `isOfferKind`
- Produces: `StartScreen`의 `Props`에 `installKind: InstallKind`, `onInstall: () => void`

- [ ] **Step 1: `web/components/StartScreen.tsx`를 고친다.**
  - 상태 하나: 안내 상자가 펼쳐져 있는지(`guideOpen`). 이 파일은 지금 상태가 없는 서버 조각이므로 맨 위에 `"use client"`를 더한다(부모 `page.tsx`가 이미 클라이언트 조각이라 동작은 같다).
  - 링크: `isOfferKind(installKind) && !guideOpen`일 때만 그린다. `최근 기록 보기`와 같은 클래스(`btn rounded-full bg-background px-5 text-muted underline underline-offset-4`)의 `<button type="button">`이고 글자는 `홈 화면에 추가`다. 두 링크를 `flex flex-wrap justify-center gap-2` 한 줄에 나란히 둔다. `loading` 중에는 다른 버튼들처럼 `aria-disabled`로 막는다.
  - 누르면: `installKind`가 `prompt`이면 `onInstall()`만 부르고 상자는 펼치지 않는다. `ios`·`in-app`이면 `guideOpen`을 켠다.
  - 펼쳐진 동안: 소개 글 두 문단이 든 종이색 상자 **대신** `<InstallGuide kind={installKind} variant="direct" onInstall={onInstall} onClose={…} />`를 같은 자리(`max-w-xs`)에 그린다. 노렌 제목과 아래 버튼 묶음은 그대로다.
  - 닫으면: `guideOpen`을 끄고, 다시 나타난 `홈 화면에 추가` 링크로 초점을 돌려준다(ref + 다음 그리기 뒤 `focus()`). **닫음 표시는 남기지 않는다** — 스스로 눌러 본 것이지 권유를 거절한 것이 아니다(설계 문서 6-3-1). 이 까닭을 주석으로 적는다.
  - `guideOpen`인데 `installKind`가 더는 안내할 상황이 아니게 되면(예: 그 사이 설치됨) 상자를 그리지 않고 소개 글을 그린다.

- [ ] **Step 2: `web/app/page.tsx`의 `<StartScreen>`에 `installKind={kind}`와 `onInstall={() => requestInstall("start")}`를 넘긴다.**

- [ ] **Step 3: 브라우저(390×844)에서 확인한다.** 흉내 내는 방법은 Task 3 Step 6과 같다.

  | 상황 | 기대하는 것 |
  |---|---|
  | 그 밖 | 링크가 없다. 시작 화면이 지금과 똑같다 |
  | 아이폰 | `최근 기록 보기` 옆에 `홈 화면에 추가`가 있다. 누르면 소개 글 자리에 제목 `홈 화면에 추가하기`와 순서 셋이 뜨고 링크는 사라진다. `✕`를 누르면 소개 글과 링크가 돌아온다 |
  | 다른 앱 안 | 누르면 "여기서는 추가할 수 없어요…"와 강조색이 **아닌** `주소 복사하기`가 뜬다. 화면에 강조색으로 칠한 버튼은 `지금 있는 곳에서 찾기` 하나뿐이다 |
  | 설치 신호 | 콘솔에서 신호를 흉내 낸 뒤 링크를 누르면 상자 없이 넘어가고(흉내라 창은 뜨지 않는다) 링크가 사라진다. `localStorage`에 닫음 열쇠가 **생기지 않는다** |
  | 닫음 표시가 있는 아이폰 | `localStorage`에 닫음 열쇠를 `1`로 넣고 다시 열어도 링크는 **남아 있다** |

  함께 볼 것: 320px 폭에서 두 링크가 넘치지 않고 줄바꿈된다. `lastSpotName`이 있을 때(버튼이 하나 더 있을 때)도 아래 버튼 묶음이 화면 밖으로 밀려나지 않는다. 상자가 펼쳐지면 화면 낭독기 초점이 제목으로 간다.

- [ ] **Step 4: 시험·린트·빌드를 돌린다.** Run: `cd web && npm test && npm run lint && npm run build` → Expected: 전부 통과.

- [ ] **Step 5: 커밋한다.**

```bash
git add web/components/StartScreen.tsx web/app/page.tsx
git commit -m "feat(web): 시작 화면에 홈 화면 추가 링크를 둔다"
```

---

### Task 5: 문서 갱신과 전체 확인

**완료조건:** 아래 Step 1의 문서 세 개가 갱신되어 있고, Step 3의 명령이 전부 통과하며, 코드 리뷰에서 나온 지적이 처리되어 있다.

**Files:**
- Modify: `README.md` ("화면 다섯 개"의 시작·결과 그림, "어떻게 동작하나"의 `localStorage` 문단들, "폴더 구조", "지금 아는 한계")
- Modify: `PRODUCT.md` ("Operating Context"의 `localStorage` 줄)
- Modify: `DESIGN.md` ("Components"에 안내 상자 항목, "Decision Closure" 다음 자리)

- [ ] **Step 1: 문서를 고친다.** 이 저장소의 문서는 처음 읽는 사람이 알아듣는 말로 쓴다 — 도구 이름이나 내부 약어를 쓰지 않는다.
  - `README.md`
    - 화면 그림: 시작 화면에 `홈 화면에 추가` 링크, 결과 화면에 안내 상자를 더한다. 어느 상황에서 보이고 안 보이는지(설계 문서 6-4의 표)를 그림 아래에 적는다.
    - `localStorage` 문단 뒤에 한 문단: 안내를 닫았다는 표시(`random-choice.install-dismissed.v1`, `web/lib/install.ts`)가 남고, 이것은 사용자가 만든 설정이지 카카오 조회 결과가 아니라는 것.
    - 폴더 구조: `app/manifest.ts`, `components/InstallGuide.tsx`, `lib/install.ts`, `assets/`, `scripts/make-icons.mjs`.
    - 지금 아는 한계에 새 문단 "홈 화면에 추가한 앱": 인터넷이 끊기면 브라우저의 기본 오류 화면이 뜬다 / 아이폰은 이미 추가했는지 브라우저 안에서 알 수 없어 Safari로 다시 오면 안내가 또 보인다 / 설치 신호가 오지 않는 브라우저에서는 안내가 아예 없다 / 주소를 바꾸면 추가한 사람은 다시 추가해야 하고 기록도 넘어가지 않는다 / 앱 스토어에는 올리지 않았다 / 다른 앱 안인지 가리는 목록 가운데 실제 기기로 확인한 것은 카카오톡뿐이다 / 실제 기기 확인 결과는 아직 없다(맨 끝 절을 마치면 이 줄을 결과로 바꾼다).
  - `PRODUCT.md`: `localStorage`에 남는 것 목록에 "홈 화면 추가 안내를 닫았는지"를 더한다.
  - `DESIGN.md`: "Install Guide Box" 항목 — 종이색 바닥, 1px 테두리, 모서리 12px, 오른쪽 위 `✕`. 결과 화면에서는 강조색 버튼, 시작 화면에서는 조용한 버튼(한 화면에 강조색 버튼 하나 규칙). 움직임은 `rise`뿐. 시작 화면의 링크는 `최근 기록 보기`와 같은 모양.

- [ ] **Step 2: 옛 서술이 남았는지 찾는다.** Run: 저장소 루트에서 `grep -n "화면 다섯 개\|만 남아요\|localStorage" README.md PRODUCT.md DESIGN.md` → 나온 줄마다 이번 변경과 어긋나는 문장이 없는지 읽는다. (시작 화면의 "이 기기에는 마지막 검색어와 정한 가게(14일)만 남아요" 문장은 고치지 않기로 정했다 — 설계 문서 12절 4번.)

- [ ] **Step 3: 전체를 다시 돌린다.** Run: 저장소 루트에서 `just check`(없거나 실패 원인이 이 작업과 무관하면 `cd web && npm test && npm run lint && npm run build`) → Expected: 전부 통과, 빌드 출력에 `/manifest.webmanifest`.

- [ ] **Step 4: 설치 가능 판정을 확인한다.** `cd web && npm run build && npx next start`로 켠 뒤 Chrome으로 `http://localhost:3000`을 열고, 개발자 도구 Application 탭의 Manifest 항목에 이름 `오늘은 뭐 먹지?`, 아이콘 셋이 오류 없이 보이는지 확인한다. `curl -s http://localhost:3000/manifest.webmanifest`가 Task 2의 값을 담은 JSON을 돌려주는지도 본다.

- [ ] **Step 5: 코드 리뷰를 받는다.** 작업 단위마다 검토를 거치지 않았다면 `/code-review`를 한 번 돌리고, React 코드는 `vercel:react-best-practices` 기준을 포함해 본다. 나온 지적을 고치고 Step 3을 다시 돌린다.

- [ ] **Step 6: 커밋한다.**

```bash
git add README.md PRODUCT.md DESIGN.md
git commit -m "docs: 홈 화면 추가 안내와 그 한계를 적는다"
```

---

## 사람이 직접 해야 하는 일 (배포한 뒤)

이 플랜의 작업으로는 할 수 없고, README "다시 올릴 때"의 절차로 화면을 올린 뒤에 실제 휴대폰으로 확인한다. 결과는 README "지금 아는 한계"에 적는다.

- [ ] 안드로이드 Chrome: `여기로 정했어요` 뒤 상자의 버튼을 누르면 설치 확인 창이 뜬다. 설치 뒤 아이콘으로 열면 주소창 없이 시작 화면이 뜬다. **상자가 아예 뜨지 않으면** 서비스 워커가 없어 설치 신호가 오지 않는 것이므로, 설계 문서 5절의 "되돌아갈 조건"에 따라 아무것도 저장하지 않는 최소한의 서비스 워커를 더하는 작업을 따로 잡는다.
- [ ] 아이폰 Safari: 순서 안내의 버튼 위치·이름이 실제 화면과 맞고, 따라 하면 홈 화면에 추가된다.
- [ ] 카카오톡으로 받은 링크: "여기서는 추가할 수 없어요" 안내가 나오고 `주소 복사하기`가 동작한다.
- [ ] 홈 화면에서 연 상태로 한 바퀴: 위치 권한 → 후보 → 결과 → 가게 창 열고 닫기 → `여기로 정했어요` → 기록. 모든 화면에서 화면 안의 버튼만으로 시작 화면에 돌아올 수 있다. 안내 상자와 링크는 보이지 않는다.
- [ ] 두 기기의 홈 화면에서 아이콘 모양과 그 아래 이름이 어떻게 보이는지(이름이 잘리는지) 확인한다. 잘려도 이름은 바꾸지 않는다.
- [ ] 아이폰에서 Safari로 한 곳을 정한 뒤 홈 화면에 추가하고, 그 기록이 앱에서 보이는지 확인한다.
