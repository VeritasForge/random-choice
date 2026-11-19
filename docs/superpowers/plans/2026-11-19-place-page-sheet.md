# 가게 페이지를 앱 안에서 열기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결과 화면에서 가게 줄을 누르면 화면 아래쪽에 창이 뜨고 그 안에 카카오 가게 페이지가 보이며, 창을 닫으면 보던 목록이 그대로 남게 한다.

**Architecture:** 브라우저 기본 `dialog`를 감싼 새 화면 조각 `PlaceSheet`가 `iframe`으로 카카오 가게 페이지를 보여 준다. `ResultScreen`은 "지금 어느 가게의 창이 열려 있는지"만 상태로 들고, 가게 이름 링크의 보통 누름만 가로채 창을 연다. 시험할 수 있는 규칙(보통 누름 판정, `iframe` 제한값)은 `web/lib/sheet.ts`에 둔다. 서버는 고치지 않는다.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, Tailwind 4, vitest(node 환경). 새 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-11-19-place-page-sheet-design.md`

## Global Constraints

- 새 npm 패키지를 설치하지 않는다.
- 새로 저장하는 값이 없다. `localStorage`에 아무것도 더하지 않는다.
- 창에 넣는 주소는 `web/lib/visits.ts`의 `kakaoPlaceUrl()`을 통과한 값만 쓴다. 카카오 조회 응답은 `http://` 주소를 주는데, 실서비스는 `https`라서 그대로 `iframe`에 넣으면 브라우저가 막는다. `kakaoPlaceUrl()`이 `https`로 올리고 카카오 가게 페이지가 아닌 주소를 거른다.
- 화면 문구는 `~해요` 체. 새 문구는 `닫기`, `카카오에서 열기` 둘뿐이다.
- 그림자·블러·그라데이션을 쓰지 않는다(`DESIGN.md`의 평면 구조 규칙). 누를 수 있는 것은 최소 48px.
- 새 CSS 애니메이션을 더하지 않는다. 창은 움직임 없이 바로 나타난다(사용자가 써 보고 승인한 실험 페이지가 그랬다). `web/lib/motion.test.ts`가 `globals.css`의 모든 애니메이션이 움직임 줄이기 설정에서 꺼지는지 대조하므로, 애니메이션을 더하면 그 시험이 깨진다.
- 공통 CSS 클래스는 `web/app/globals.css`의 `@layer components` 안에 둔다.
- 기록 화면(`web/components/VisitsScreen.tsx`)은 건드리지 않는다.
- 커밋 메시지는 이 저장소의 관례(`feat(web): …한다`, `docs: …적는다`)를 따른다. 지금 브랜치가 `main`이므로 시작할 때 작업 브랜치 `feat/place-page-sheet`를 만든다.

## Review Focus

1. **Ctrl·Cmd·Shift·Alt를 누른 채 누르거나 가운데 버튼으로 누름** → 창이 아니라 지금처럼 새 탭이 열려야 한다. (Task 1의 `isPlainClick` 시험)
2. **카카오가 가게 페이지 주소를 비워 보냈거나 카카오 주소가 아님** → 창이 열리지 않고 그 줄은 지금과 똑같이 동작해야 한다. (Task 1 Step 6의 브라우저 확인, 주소 판정 자체는 `web/lib/visits.test.ts`에 이미 있다)
3. **창 안의 카카오 버튼(`앱 열기`, `출발`, `도착`)을 누름** → 이 서비스 화면 전체가 카카오로 넘어가 결과를 잃으면 안 된다. (Task 1의 `SHEET_SANDBOX` 시험 + Step 6 브라우저 확인)
4. **창이 열린 채 휴대폰의 뒤로 가기** → 창만 닫혀야 한다. 이 앱은 방문 기록(history)을 전혀 쓰지 않아서, 아무 처리도 없으면 뒤로 가기가 사이트를 떠나 뽑은 결과가 사라진다. (Task 2)
5. **창을 닫은 뒤** → 목록, `정하신 곳` 표시, 스크롤 위치가 그대로이고 카카오 조회가 다시 일어나지 않아야 한다. (Task 1 Step 6)

---

### Task 1: 창 조각과 결과 화면 연결

**완료조건:** `cd web && npm test`가 전부 통과하고, 브라우저(390×844)에서 가게 줄을 눌렀을 때 창 안에 평점이 보이며 닫으면 목록이 그대로다.

**쓸 스킬:** 화면 코드를 쓰기 전에 `vercel:react-best-practices`를 읽는다.

**Files:**
- Create: `web/lib/sheet.ts`
- Create: `web/lib/sheet.test.ts`
- Create: `web/components/PlaceSheet.tsx`
- Modify: `web/components/ResultScreen.tsx` (`PlaceRow` 함수, `ResultScreen` 본문의 목록과 맨 끝)
- Modify: `web/app/globals.css` (`@layer components` 안, `.row-action` 규칙 뒤)

**Interfaces:**
- Consumes: `kakaoPlaceUrl(value: unknown): string | null` (`web/lib/visits.ts`), `Place` (`web/lib/api.ts`)
- Produces:
  - `web/lib/sheet.ts`:
    - `type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }`
    - `isPlainClick(event: ClickLike): boolean`
    - `const SHEET_SANDBOX: string`
  - `web/components/PlaceSheet.tsx`:
    - `type SheetPlace = { name: string; url: string }`
    - `default function PlaceSheet(props: { place: SheetPlace | null; onClose: () => void })`

- [x] **Step 0: 작업 브랜치를 만든다**

```bash
git switch -c feat/place-page-sheet
```

- [x] **Step 1: 실패하는 시험을 쓴다** — `web/lib/sheet.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isPlainClick, SHEET_SANDBOX } from "./sheet";

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

describe("가게 창을 여는 누름", () => {
  it("보조 키 없는 왼쪽 누름만 창을 연다", () => {
    expect(isPlainClick(plain)).toBe(true);
  });

  it.each([
    ["가운데 버튼", { ...plain, button: 1 }],
    ["Cmd", { ...plain, metaKey: true }],
    ["Ctrl", { ...plain, ctrlKey: true }],
    ["Shift", { ...plain, shiftKey: true }],
    ["Alt", { ...plain, altKey: true }],
  ])("%s 누름은 브라우저에 맡긴다", (_name, event) => {
    expect(isPlainClick(event)).toBe(false);
  });
});

describe("가게 창의 iframe 제한", () => {
  const tokens = SHEET_SANDBOX.split(" ");

  it("카카오 페이지가 동작하는 데 필요한 것을 허용한다", () => {
    expect(tokens).toEqual(
      expect.arrayContaining(["allow-scripts", "allow-same-origin", "allow-popups"]),
    );
  });

  it("창 안의 페이지가 이 서비스 화면 전체를 다른 곳으로 보내지 못한다", () => {
    expect(tokens.filter((t) => t.startsWith("allow-top-navigation"))).toEqual([]);
  });
});
```

- [x] **Step 2: 시험이 실패하는지 확인한다**

Run: `cd web && npx vitest run lib/sheet.test.ts`
Expected: FAIL — `./sheet`를 찾지 못한다는 오류.

- [x] **Step 3: `web/lib/sheet.ts`를 만든다**

`isPlainClick`은 `button === 0`이고 네 보조 키가 모두 꺼졌을 때만 `true`다. `SHEET_SANDBOX`는 아래 값 그대로다(2026-11-19에 이 값으로 카카오 가게 페이지가 정상 표시되는 것을 크롬 계열 브라우저에서 확인했다).

```ts
export const SHEET_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms";
```

상수 위에 "왜 `allow-top-navigation`이 없는지"(창 안의 카카오 버튼이 이 서비스 화면 전체를 넘겨 버리면 메모리에만 있는 결과가 사라진다)를 주석으로 적는다.

- [x] **Step 4: 시험이 통과하는지 확인한다**

Run: `cd web && npx vitest run lib/sheet.test.ts`
Expected: PASS (8개).

- [x] **Step 5: `PlaceSheet`를 만들고 결과 화면에 연결한다**

`web/components/PlaceSheet.tsx`:

- 맨 바깥은 언제나 그려지는 `<dialog className="sheet">`다. `place`가 `null`이 아니게 되면 `showModal()`을 부르고, `null`이 되면 열려 있을 때만 `close()`를 부른다(`useEffect`, `dialog`의 `ref`).
- `dialog`의 `onClose`(Esc 키와 `close()` 모두 이 이벤트를 낸다)에서 `props.onClose()`를 부른다.
- 창 바깥 어두운 영역을 누르면 닫는다: `dialog`의 `onClick`에서 `event.target === event.currentTarget`일 때만 `close()`. 이 판정이 맞으려면 `dialog` 자신에는 안쪽 여백이 없고 내용 전체를 안쪽 `div` 하나가 감싸야 한다.
- 머리줄(`place !== null`일 때만 내용을 그린다): 왼쪽에 가게 이름(`truncate`, `font-semibold`), 오른쪽에 `<a href={place.url} target="_blank" rel="noreferrer noopener" className="btn btn-quiet btn-sm">카카오에서 열기</a>`와 `<button type="button" className="btn btn-quiet btn-sm">닫기</button>`. `닫기`가 `dialog` 안의 첫 누를 것이 되지 않도록 순서는 이름 → `카카오에서 열기` → `닫기`다.
- 본문: `place !== null`일 때만 `<iframe src={place.url} title={`${place.name} 카카오 가게 페이지`} sandbox={SHEET_SANDBOX} className="sheet-frame" />`. 닫히면 `iframe`이 사라져 카카오 페이지 로딩이 멈춘다.
- 닫은 뒤 포커스를 눌렀던 가게 이름으로 돌려놓는 일은 `showModal()`로 연 `dialog`가 스스로 한다. 따로 코드를 쓰지 않는다.

`web/app/globals.css`, `@layer components` 안 `.row-action` 뒤:

| 선택자 | 값 |
|---|---|
| `.sheet` | `position: fixed; inset: auto 0 0 0; margin: 0 auto; width: 100%; max-width: 28rem; height: 85dvh; max-height: 85dvh; padding: 0; border: 1px solid var(--line); border-bottom: 0; border-radius: 12px 12px 0 0; background: var(--background); color: var(--foreground); overflow: hidden;` |
| `.sheet::backdrop` | `background: color-mix(in oklab, var(--foreground) 40%, transparent);` |
| `.sheet-frame` | `display: block; width: 100%; border: 0;` 높이는 창에서 머리줄을 뺀 나머지(안쪽 `div`를 세로 flex로 두고 `iframe`에 `flex: 1`) |
| `html:has(.sheet[open])` | `overflow: hidden;` — 창이 열린 동안 뒤의 목록이 따라 스크롤되지 않게 한다 |

`.sheet` 위에 "왜 85dvh인지"(실험에서 가게 이름·평점·후기 수·영업시간이 첫 화면에 들어온 높이이고, 위에 남는 15%가 뒤에 목록이 있음을 보여 준다)를 주석으로 적는다.

`web/components/ResultScreen.tsx`:

- `ResultScreen`에 `const [sheet, setSheet] = useState<SheetPlace | null>(null);`을 더하고, `</section>` 바로 앞에 `<PlaceSheet place={sheet} onClose={() => setSheet(null)} />`를 둔다.
- `PlaceRow`가 `onOpen: (place: SheetPlace) => void`를 받는다. 가게 이름 `<a>`는 `href`, `target`, `rel`, 클래스를 **지금 그대로** 두고 `onClick`만 더한다: `const url = kakaoPlaceUrl(place.placeUrl)`이 `null`이 아니고 `isPlainClick(event)`이면 `event.preventDefault()` 뒤 `onOpen({ name: place.name, url })`. 둘 중 하나라도 아니면 아무것도 하지 않아 지금처럼 새 탭이 열린다.
- `PlaceRow` 위의 긴 주석에 "보통 누름은 창을 열고, 링크를 남겨 둔 것은 새 탭 열기를 살리기 위해서"라는 한 문단을 더한다.

- [x] **Step 6: 브라우저에서 확인한다**

Run: `just dev` (카카오 열쇠가 `api/.env`의 `KAKAO_REST_API_KEY`로 있어야 한다. 2026-11-19 현재 이 파일이 없다. 없으면 멈추고 사용자에게 열쇠를 요청한다)

390×844 크기로 `http://localhost:3000`을 열어, 위치 검색으로 아무 곳이나 고르고 결과 화면까지 간 뒤 아래를 하나씩 본다.

| 해 볼 것 | 기대하는 결과 |
|---|---|
| 가게 줄을 누른다 | 창이 뜨고 평점·후기 수가 스크롤 없이 보인다. 주소창의 주소는 `localhost:3000` 그대로다 |
| `닫기`, Esc, 창 바깥 누르기 각각 | 창이 닫히고 목록·`정하신 곳` 표시·스크롤 위치가 그대로다. 포커스가 눌렀던 가게 이름에 있다 |
| 창을 닫고 다른 가게를 누른다 | 그 가게의 페이지가 뜬다. 개발자 도구 네트워크 탭에 `/api/v1/nearby` 요청이 새로 생기지 않는다 |
| Cmd(또는 Ctrl)를 누른 채 가게 이름을 누른다 | 창 없이 새 탭이 열린다 |
| 창 안의 `앱 열기`, `출발`, `도착`을 누른다 | 이 서비스의 주소창 주소가 바뀌지 않는다. 각 버튼이 실제로 무엇을 했는지(새 탭, 무반응 등)를 기록해 Task 3의 문서에 적는다 |
| `카카오에서 열기`를 누른다 | 새 탭에 같은 가게 페이지가 열린다 |
| `여기로 정했어요` 버튼을 누른다 | 창이 열리지 않고 지금처럼 기록만 된다 |
| 창이 열린 동안 뒤의 목록을 스크롤해 본다 | 움직이지 않는다 |
| 어두운 화면 설정으로 바꾼다 | 창의 테두리와 머리줄 글자가 읽힌다 |

하나라도 다르면 고치고 이 표를 처음부터 다시 본다.

- [x] **Step 7: 전체 검증 후 커밋한다**

Run: `just check`
Expected: 시험·빌드·타입 검사·린트가 모두 오류 없이 끝난다.

```bash
git add web/lib/sheet.ts web/lib/sheet.test.ts web/components/PlaceSheet.tsx web/components/ResultScreen.tsx web/app/globals.css
git commit -m "feat(web): 결과 화면에서 가게 페이지를 화면 안의 창으로 연다"
```

---

### Task 2: 뒤로 가기로 창 닫기

**왜 따로 떼었나:** 이 앱은 지금 방문 기록(history)을 전혀 쓰지 않는다. 그래서 창이 열린 채 휴대폰의 뒤로 가기를 하면 사이트를 떠나고, 메모리에만 있던 결과가 사라진다. 지금의 새 탭 방식에서는 뒤로 가기가 탭만 닫았으므로 이것은 이번 변경이 새로 만드는 문제다. 다만 `iframe` 안의 이동도 같은 방문 기록에 쌓이기 때문에 브라우저에서 실제로 확인해야 하는 부분이 있어, Task 1과 따로 판정할 수 있게 나눈다.

**완료조건:** 창을 연 뒤 브라우저의 뒤로 가기를 하면 창만 닫히고 결과 화면이 남는다. 창을 `닫기`로 닫은 뒤의 뒤로 가기는 이 변경 전과 똑같이 동작한다(기록 항목이 남아 "한 번 헛도는" 일이 없다).

**Files:**
- Modify: `web/components/PlaceSheet.tsx`

**Interfaces:**
- Consumes: Task 1의 `PlaceSheet`
- Produces: 없음(바깥에서 보는 모양은 그대로다)

- [x] **Step 1: `PlaceSheet`에 방문 기록 처리를 더한다**

- 창이 열릴 때(`showModal()` 직후) `history.pushState({ placeSheet: true }, "")`를 한 번 한다.
- 창이 열려 있는 동안 `popstate`를 듣고, 오면 `dialog.close()`를 부른다(이때는 기록 항목이 이미 빠졌으므로 아래의 `history.back()`을 하지 않는다).
- `닫기`·Esc·바깥 누르기로 닫힐 때는, 우리가 넣은 항목이 아직 맨 위에 있으면(`history.state?.placeSheet === true`) `history.back()`으로 그 항목을 뺀다.
- 두 경로를 구분하는 표시는 `useRef<boolean>` 하나로 둔다. 까닭을 주석으로 적는다.

- [x] **Step 2: 브라우저에서 확인한다**

Run: `just dev`

| 해 볼 것 | 기대하는 결과 |
|---|---|
| 창을 열고 브라우저 뒤로 가기 | 창만 닫히고 결과 화면이 그대로다 |
| 창을 열고 `닫기`, 그다음 뒤로 가기 | 이 변경 전과 같은 곳으로 간다(한 번 눌러서 아무 일도 없는 경우가 없다) |
| 창을 열고 카카오 페이지 안에서 `메뉴`·`후기` 탭을 몇 번 누른 뒤 뒤로 가기를 반복 | 몇 번째든 결국 창이 닫히고 결과 화면이 남는다. 사이트를 떠나지 않는다 |
| 창을 세 번 열고 닫은 뒤 `history.length`를 콘솔에서 본다 | 처음 값에서 많아야 1 늘어 있다 |

세 번째 줄이 실패하면(카카오 페이지 안의 이동이 기록을 쌓아 `history.back()` 한 번으로 우리 항목이 빠지지 않는 경우) 억지로 맞추지 말고 **멈춰서 사용자에게 보고한다.** 그때의 선택지는 "뒤로 가기 처리를 빼고 이 한계를 README에 적는다"와 "기록 항목 수를 세어 한꺼번에 되돌린다"이고, 고르는 것은 사용자다.

- [x] **Step 3: 전체 검증 후 커밋한다**

Run: `just check`
Expected: 모두 오류 없이 끝난다.

```bash
git add web/components/PlaceSheet.tsx
git commit -m "feat(web): 가게 창이 열린 채 뒤로 가면 창만 닫는다"
```

---

### Task 3: 문서 고치기와 마무리 검증

**완료조건:** 세 문서가 새 동작을 설명하고, 옛 설명("가게 이름을 누르면 새 탭")이 결과 화면에 대해서는 남아 있지 않다.

**Files:**
- Modify: `DESIGN.md` (`### Place Rows` 절 뒤에 `### Place Sheet (결과 화면)` 절을 더한다)
- Modify: `README.md` (결과 화면 동작 설명과 "아직 없는 것들" 주변의 한계 설명)
- Modify: `docs/todo.md` (2번 "도보 길찾기 바로 열기"의 "지금은 가게 이름을 누르면…" 문장)
- Modify: `docs/superpowers/specs/2026-11-19-place-page-sheet-design.md` (4절의 "확인되지 않은 것" 중 이번에 확인한 항목을 결과로 바꾼다)

- [x] **Step 1: 옛 설명이 남은 곳을 찾는다**

Run: `grep -n -E '새 탭|가게 페이지|상세 페이지' README.md DESIGN.md PRODUCT.md docs/todo.md web/README.md`

결과 화면의 가게 이름에 대해 "새 탭으로 열린다"고 적은 문장을 전부 고친다. 기록 화면에 대한 문장은 그대로 둔다(그 화면은 바뀌지 않았다).

- [x] **Step 2: 문서를 고친다**

- `DESIGN.md`의 새 절: 창의 모양(높이 85dvh, 폭 최대 28rem, 위쪽 모서리 12px, 1px 테두리, 그림자 없음, 어둡게 덮는 색), 머리줄 구성, 움직임이 없는 이유, 닫는 세 가지 방법.
- `README.md`: 결과 화면 설명에 창을 더하고, 한계를 적는다 — ① 카카오가 서버 설정을 바꾸면 창이 빈 화면이 되며 그때는 `카카오에서 열기`로 간다 ② 이 표시 방식을 카카오 약관이 허용하는지는 확인하지 않았다(사용자 결정, 2026-11-19) ③ 아이폰 Safari와 카카오톡 안 브라우저에서는 확인하지 못했다(확인했다면 그 결과) ④ Task 1 Step 6에서 기록한 창 안 카카오 버튼들의 실제 동작.
- `PRODUCT.md`는 고치지 않는다(화면 수와 저장 범위가 그대로다).

- [x] **Step 3: 코드 리뷰를 받는다**

subagent-driven-development로 실행 중이면 Task별 리뷰로 갈음한다. 그 밖의 방식이면 `/code-review`를 한 번 돌리고, React 코드는 `vercel:react-best-practices` 기준을 함께 본다. 나온 지적을 고친 뒤 `just check`를 다시 돌린다.

- [x] **Step 4: 플랜 전체 완료조건을 검증한다**

| 완료조건 | 검증 방법 |
|---|---|
| 시험·빌드·타입·린트 통과 | `just check`가 오류 없이 끝난다 |
| 가게 줄을 누르면 창 안에 평점이 보인다 | Task 1 Step 6 표를 최종 코드로 다시 본다 |
| 닫으면 목록이 그대로이고 조회가 다시 일어나지 않는다 | 같은 표의 둘째·셋째 줄 |
| 창이 빈 화면이어도 가게 페이지로 갈 길이 있다 | 개발자 도구에서 `place.map.kakao.com` 요청을 막은 채 창을 열어 `카카오에서 열기`가 보이고 새 탭이 열리는지 본다 |
| 기록 화면이 바뀌지 않았다 | `git diff main -- web/components/VisitsScreen.tsx`가 비어 있다 |
| 옛 설명이 남지 않았다 | Step 1의 grep을 다시 돌려 결과 화면에 대한 "새 탭" 문장이 없다 |

미충족 항목이 있으면 원인을 적고 보완 Task를 이 파일에 더한 뒤 다시 검증한다.

- [x] **Step 5: 커밋한다**

```bash
git add DESIGN.md README.md docs/todo.md docs/superpowers/specs/2026-11-19-place-page-sheet-design.md docs/superpowers/plans/2026-11-19-place-page-sheet.md
git commit -m "docs: 결과 화면의 가게 창과 그 한계를 적는다"
```
