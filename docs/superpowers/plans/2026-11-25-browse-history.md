# 본 것은 다시 안 보여 주고 이전 묶음으로 돌아가기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 후보 화면(음식 종류)과 결과 화면(가게)에서, 이번에 본 것은 한 바퀴를 다 볼 때까지 다시 보여 주지 않고, `이전` 버튼으로 지나간 넷 묶음에 한 단계씩 돌아갈 수 있게 한다.

**Architecture:** 두 화면이 함께 쓰는 순수 함수 모듈 `web/lib/browse.ts`가 "넘겨 본 기록"(본 묶음들, 지금 위치, 이번 바퀴에서 본 것)과 그 위의 `이전`·`다음` 규칙을 갖는다. 가게 쪽의 "가까운 순 범위를 8곳씩 넓히기"는 `web/lib/places.ts`가 이 모듈 위에 얹는다. `web/app/page.tsx`의 `view`가 두 기록을 들고 다니며, 화면 컴포넌트는 지금 묶음과 버튼 상태만 받는다.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 5, Tailwind 4, vitest 4 (화면 `.tsx`는 시험하지 않는 구성: `web/vitest.config.mts`).

**Spec:** `docs/superpowers/specs/2026-11-25-browse-history-design.md`

## 완료 조건 (플랜 전체)

- `cd web && npm test` 통과(새 `browse.test.ts`, 바뀐 `places.test.ts` 포함).
- `just check` 통과(서버 시험·vet, 화면 build·test·tsc·lint).
- `just dev`로 띄운 실제 화면에서 Task 4 Step 5의 확인 항목 4개가 모두 기대대로 동작.
- `web-design-guidelines` 감사(Task 4 Step 6)에서 이번 변경 부분에 남은 지적 없음.
- `grep -rn "pickPlaces" web/` 결과 없음(옛 함수 잔재 없음).

## Global Constraints

- 항목이 같은지는 **객체 참조**로 견준다. 종류는 `distinctById`가 받은 객체를 그대로 돌려주는 계약(`web/lib/cuisines.ts`), 가게는 `pool` 배열을 다시 만들지 않는 계약(`web/lib/places.ts`)에 기댄다. 가게를 `id`로 견주지 않는다(식별자가 빈 가게가 있다).
- 정렬에 `toSorted`를 쓰지 않는다. `slice().sort(...)`를 쓴다(Firefox 111 하한, `web/lib/places.ts` 주석).
- 누를 수 없는 버튼은 `disabled`가 아니라 `aria-disabled="true"`와 클릭 무시로 만든다(`DESIGN.md` Disabled, `web/app/globals.css`의 `[aria-disabled="true"]`).
- 값: `CANDIDATE_COUNT = 4`, `PLACE_COUNT = 4`, `WINDOW_STEP = 8`(모두 기존 값 그대로).
- 버튼 문구: `이전 후보`, `다시 뽑기`, `이전 가게`, `다른 가게 보기`(앞의 둘은 후보 화면, 뒤의 둘은 결과 화면).
- 버튼 배치: 앞뒤 버튼 둘을 한 줄에 반 폭씩, 높이 48px(기존 `.btn`), 간격 12px(`gap-3`). `정해 주세요`·`다른 종류 고르기`·`처음부터 다시`는 지금처럼 가로 가득.
- 기록은 브라우저 저장소에 쓰지 않는다(`view` 상태에만 둔다).
- 무작위 함수는 `Rng`(`web/lib/pick.ts`)로 밖에서 받는다.
- React 코드를 고치는 Task(3·4)는 `vercel-react-best-practices`와 `vercel-composition-patterns` 스킬 기준을 따른다. Task 4가 끝나면 `web-design-guidelines` 스킬로 바뀐 두 화면(`CandidateScreen.tsx`, `ResultScreen.tsx`)의 접근성·웹 표준을 감사한다. (Vercel 플러그인의 `vercel:react-best-practices`는 이름만 비슷한 다른 스킬이다.)

## Review Focus

- **종류 수가 4의 배수가 아닐 때(예: 13종류) 바퀴가 넘어가는 묶음**: 남은 1종류가 반드시 들어가고, 빈 세 자리는 바로 앞 묶음과 겹치지 않아야 한다 → Task 1 시험 `바퀴 경계: 남은 것을 모두 넣고 빈자리는 지금 묶음과 겹치지 않게 채운다`.
- **두 번째 바퀴 직후**: 바퀴를 넘긴 묶음에 넣은 항목이 바로 다음 새 묶음에 또 나오면 안 된다 → Task 1 시험 `두 번째 바퀴는 바퀴를 넘긴 묶음의 항목을 본 것으로 시작한다`.
- **`이전`을 여러 번 누른 뒤 `다음`으로 끝까지 갔다가 새로 뽑을 때**: 다시 지나간 묶음은 같은 내용·같은 순서이고, 끝에서 뽑는 새 묶음은 이번 바퀴에서 본 것을 피해야 한다 → Task 1 시험 `이전 뒤 다음은 같은 묶음을 다시 지나가고 끝에서만 새로 뽑는다`.
- **가게가 5~7곳이라 범위가 처음부터 `pool` 전체인 종류**: 두 번째 묶음에 안 본 1~3곳이 모두 들어가야 한다 → Task 2 시험 `범위가 처음부터 pool 전체면 둘째 묶음에 남은 가게가 모두 들어간다`.
- **결과 화면에서 `다른 종류 고르기`로 돌아올 때와 `다시 넣기`를 누를 때**: 앞은 보던 후보 묶음과 `이전 후보` 상태가 그대로, 뒤는 가게 기록이 처음부터(`이전 가게` 흐림) → 화면 시험이 없으므로 Task 4 수동 확인 항목.

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `web/lib/browse.ts` (새) | 넘겨 본 기록 자료형과 `startBrowse`·`browseNext`·`browsePrev`·`currentPage`·`canGoBack`·`canGoForward` |
| `web/lib/browse.test.ts` (새) | 위 규칙의 시험 |
| `web/lib/places.ts` | `pickPlaces`를 없애고 `nearestWindow`·`byDistance`·`startPlaces`·`nextPlaces`로 나눔 |
| `web/lib/places.test.ts` | `pickPlaces` 시험을 새 함수 기준으로 옮김 |
| `web/app/page.tsx` | `view`의 `candidates`→후보 기록, `places`·`windowSize`→가게 기록. 핸들러 `prevCandidates`·`prevPlaces` 추가 |
| `web/components/CandidateScreen.tsx` | `이전 후보` 버튼, 앞뒤 버튼 한 줄 배치 |
| `web/components/ResultScreen.tsx` | `이전 가게` 버튼, 앞뒤 버튼 한 줄 배치 |
| `DESIGN.md` | "후보 화면의 두 버튼" 항목을 이번 결정으로 고침 |
| `README.md` | 화면 ③·④ 그림과 설명, `다시 뽑기`·`다른 가게 보기` 동작 설명 |
| `docs/todo.md` | 1번 체크 |

---

### Task 1: 넘겨 본 기록 모듈

**Files:**
- Create: `web/lib/browse.ts`
- Test: `web/lib/browse.test.ts`

**Interfaces:**
- Consumes: `pickDistinct`, `pickAvoiding`, `type Rng` from `web/lib/pick.ts`
- Produces:
  ```ts
  export type Browse<T> = {
    readonly pages: readonly (readonly T[])[]; // 본 묶음들, 본 순서
    readonly index: number;                    // 지금 보는 묶음의 위치
    readonly seen: ReadonlySet<T>;             // 이번 바퀴에서 본 항목(참조 비교)
  };
  export function startBrowse<T>(items: readonly T[], count: number, rng: Rng, order?: (page: T[]) => T[]): Browse<T>;
  export function browseNext<T>(b: Browse<T>, items: readonly T[], count: number, rng: Rng, order?: (page: T[]) => T[]): Browse<T>;
  export function browsePrev<T>(b: Browse<T>): Browse<T>;
  export function currentPage<T>(b: Browse<T>): readonly T[];
  export function canGoBack<T>(b: Browse<T>): boolean;           // index > 0
  export function atEnd<T>(b: Browse<T>): boolean;               // index === pages.length - 1
  export function canGoForward<T>(b: Browse<T>, items: readonly T[], count: number): boolean; // !atEnd(b) || items.length > count
  ```
  `order`는 뽑은 묶음을 기록에 넣기 전에 한 번 적용한다(가게의 거리순 정렬). 기록에 들어간 묶음은 다시 정렬하지 않는다.

- [ ] **Step 1: 실패하는 시험 작성** (`web/lib/browse.test.ts`)

  `pick.test.ts`의 `fixed`·`zero` 도우미와 같은 것을 쓴다. 항목은 문자열(`"A"`…`"M"`)로 충분하다(문자열은 값 비교지만 규칙 시험에는 문제없다). 시험 이름과 확인할 것:

  - `startBrowse는 첫 묶음을 기록하고 본 것으로 표시한다`: 12개에서 `count=4` → `pages.length===1`, `index===0`, `seen.size===4`, `canGoBack===false`.
  - `한 바퀴 안에서는 같은 항목이 두 번 나오지 않는다`: 12개, `browseNext` 2번 → 세 묶음의 합집합 크기 12.
  - `바퀴 경계: 남은 것을 모두 넣고 빈자리는 지금 묶음과 겹치지 않게 채운다`: 13개(A~M), 세 묶음을 본 뒤 네 번째 → 아직 안 본 1개가 들어 있고, 나머지 3개는 셋째 묶음과 겹치지 않음. 여러 `fixed(...)` 난수로 반복.
  - `두 번째 바퀴는 바퀴를 넘긴 묶음의 항목을 본 것으로 시작한다`: 위 네 번째 묶음 직후 `seen`이 그 묶음 4개와 같고, 다섯 번째 묶음은 네 번째와 겹치지 않음.
  - `바퀴가 딱 맞게 끝나면 지금 묶음과 겹치지 않게 새 바퀴를 시작한다`: 8개, 두 묶음 뒤 세 번째 → 둘째와 겹치지 않고, `seen`은 셋째 묶음 4개.
  - `이전은 한 칸씩 돌아가고 첫 묶음에서는 그대로다`: 세 묶음 뒤 `browsePrev` 두 번 → `index===0`, 한 번 더 → 같은 객체(`toBe`).
  - `이전 뒤 다음은 같은 묶음을 다시 지나가고 끝에서만 새로 뽑는다`: 세 묶음 기록 → prev 2번 → next 2번 → `currentPage`가 셋째 묶음과 `toEqual`(같은 순서), `pages.length===3` 그대로 → next 1번 → `pages.length===4`, 새 묶음은 이번 바퀴 `seen`(12개 중 앞 세 묶음)을 피함.
  - `기록 중간에서 다음은 rng를 쓰지 않는다`: 중간에서 `browseNext`에 호출 횟수를 세는 rng를 넘기면 0번.
  - `order는 새로 뽑은 묶음에 한 번만 적용된다`: `order`로 역순 정렬을 넘기면 기록된 묶음이 정렬돼 있음.
  - `항목이 count 이하이면 다음으로 갈 수 없다`: 3개 → `canGoForward(b, items, 4)===false`, 그래도 `browseNext`를 부르면 같은 객체를 돌려줌.
  - `빈 목록이면 빈 묶음 하나로 시작한다`: `currentPage`가 `[]`, `canGoBack`·`canGoForward` 모두 false.
  - `원본 목록을 바꾸지 않는다`.

- [ ] **Step 2: 실패 확인**

  Run: `cd web && npx vitest run lib/browse.test.ts`
  Expected: FAIL (`./browse` 모듈 없음)

- [ ] **Step 3: `web/lib/browse.ts` 구현**

  `browseNext`에서 끝에 있을 때 새 묶음을 뽑는 규칙(스펙 5.2):

  ```
  current = currentPage(b)
  if items.length <= count: return b
  unseen = items에서 b.seen에 없는 것
  if unseen.length >= count:  page = pickDistinct(unseen, count);           seen = b.seen ∪ page
  elif unseen.length > 0:     page = [...unseen 전부(섞어서), ...pickAvoiding(items 중 seen에 있는 것, count - unseen.length, current)]
                              seen = new Set(page)                         // 두 번째 바퀴 시작
  else:                       page = pickAvoiding(items, count, current);  seen = new Set(page)
  page = order ? order(page) : page
  return { pages: [...b.pages, page], index: b.pages.length, seen }
  ```
  `pickAvoiding`이 "피할 것만으로 못 채우면 피할 것에서 마저 채운다"를 이미 하므로 "되도록 겹치지 않게"는 그대로 맞는다. 파일 머리 주석에 스펙 경로와 "참조 비교 계약"을 적는다.

- [ ] **Step 4: 통과 확인**

  Run: `cd web && npx vitest run lib/browse.test.ts`
  Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

  ```bash
  git add web/lib/browse.ts web/lib/browse.test.ts
  git commit -m "feat(web): 본 묶음을 기록해 한 바퀴 동안 다시 안 보여 주고 앞뒤로 넘기는 규칙을 더한다"
  ```

**완료 조건:** `cd web && npx vitest run lib/browse.test.ts` 통과. (`tsc`는 Next.js가 빌드 중에 만드는 타입이 필요해 단독으로 돌리지 않는다. 타입 검사는 Task 4의 `just check`에서 한다.)

---

### Task 2: 가게 쪽 기록(가까운 순 범위 넓히기)

**Files:**
- Modify: `web/lib/places.ts` (`pickPlaces` 제거, 아래 함수로 대체. 머리 주석의 "왜 가까운 순 창에서 뽑나" 설명은 `nearestWindow`로 옮겨 살린다)
- Test: `web/lib/places.test.ts` (`pickPlaces` 시험을 옮김)

**Interfaces:**
- Consumes: Task 1의 `Browse`, `startBrowse`, `browseNext`, `atEnd`
- Produces:
  ```ts
  export const WINDOW_STEP = 8; // 그대로
  export function nearestWindow(pool: readonly Place[], windowSize: number, count: number): Place[]; // 가까운 순 앞 max(windowSize,count)곳, pool의 객체 그대로
  export function byDistance(places: Place[]): Place[];                                              // slice().sort 거리순
  export type PlaceBrowse = { browse: Browse<Place>; windowSize: number };
  export function startPlaces(pool: readonly Place[], count: number, rng: Rng): PlaceBrowse;          // windowSize = WINDOW_STEP
  export function nextPlaces(state: PlaceBrowse, pool: readonly Place[], count: number, rng: Rng): PlaceBrowse;
  ```
  `nextPlaces`: `atEnd(state.browse)`이면 `windowSize + WINDOW_STEP`으로 넓힌 범위를 `items`로 `browseNext`(order=`byDistance`), 아니면 범위를 그대로 두고 `browseNext`(이미 본 묶음으로 이동만).

- [ ] **Step 1: 시험 옮기기와 새 시험 작성**

  기존 `describe("가까운 곳 창")`의 다섯 시험은 `nearestWindow`·`startPlaces` 기준으로 같은 뜻을 유지해 옮긴다(예: "표본이 넓어도 처음에는 가까운 여덟 곳 안에서만 뽑는다" → `currentPage(startPlaces(spread,4,rng).browse)`가 모두 가까운 8곳 안). 기존 `describe("pickPlaces")`의 "고른 가게를 가까운 순으로", "난수에 따라 다른 가게가 뽑힌다", "가게가 요청 개수보다 적으면 있는 만큼만", "원본 목록의 순서를 건드리지 않는다"도 `startPlaces` 기준으로 옮긴다. "직전에 보여준 가게를 피해서"와 "모자라면 직전에서 마저 채운다"는 Task 1이 일반 규칙으로 덮으므로 아래 새 시험으로 대체한다. 새 시험:

  - `새 묶음을 뽑을 때만 범위를 넓힌다`: 30곳 pool, `nextPlaces` 2번 → `windowSize===24`, `browsePrev` 후 `nextPlaces` → `windowSize===24` 그대로.
  - `한 바퀴 동안 같은 가게가 두 번 나오지 않는다`: 30곳 pool에서 `startPlaces` 뒤 `nextPlaces` 6번 → 일곱 묶음(28곳)에 중복 없음.
  - `범위가 처음부터 pool 전체면 둘째 묶음에 남은 가게가 모두 들어간다`: 6곳 pool → 둘째 묶음에 첫 묶음에 없던 2곳이 모두 있음.
  - `묶음은 가까운 순이다`: 매 `nextPlaces` 결과 `currentPage`의 거리가 오름차순.
  - `pool의 객체를 그대로 담는다`: `currentPage`의 각 원소가 `pool.includes`로 참(참조).

- [ ] **Step 2: 실패 확인**

  Run: `cd web && npx vitest run lib/places.test.ts`
  Expected: FAIL (`startPlaces` 등 없음)

- [ ] **Step 3: `web/lib/places.ts` 구현** (위 시그니처대로. `pickPlaces` 삭제)

- [ ] **Step 4: 통과 확인**

  Run: `cd web && npx vitest run lib/places.test.ts lib/browse.test.ts`
  Expected: PASS

  이 시점에는 `page.tsx`가 아직 `pickPlaces`를 import하므로 `npm run build`는 실패한다. Task 3·4와 한 브랜치에서 이어지므로 괜찮지만, 커밋 메시지에 남긴다.

- [ ] **Step 5: 커밋**

  ```bash
  git add web/lib/places.ts web/lib/places.test.ts
  git commit -m "refactor(web): 가게 뽑기를 넘겨 본 기록 위에 얹고 범위는 새로 뽑을 때만 넓힌다"
  ```

**완료 조건:** `cd web && npx vitest run lib/places.test.ts lib/browse.test.ts` 통과.

---

### Task 3: 후보 화면에 기록과 `이전 후보` 연결

**Files:**
- Modify: `web/app/page.tsx` (`View`의 `candidates` 갈래와 `result` 갈래, `start`, `reshuffle`, `choose`, `decideForMe`, `backToCandidates`, `CandidateScreen` 렌더)
- Modify: `web/components/CandidateScreen.tsx`
- Modify: `DESIGN.md` ("후보 화면의 두 버튼" 항목)
- Modify: `README.md` (화면 ③ 그림, 그 아래 설명)

**Skills:** `vercel-react-best-practices`, `vercel-composition-patterns` (Step 1 전에 불러 기준을 확인한다. 특히 `CandidateScreen`에 boolean prop(`canPrev`, `canReshuffle`)이 늘어나는 것이 composition 기준에 걸리는지 보고, 걸리면 더 나은 props 모양을 택하되 `page.tsx`가 상태를 갖는 구조는 바꾸지 않는다.)

**Interfaces:**
- Consumes: Task 1의 `startBrowse`, `browseNext`, `browsePrev`, `currentPage`, `canGoBack`, `canGoForward`
- Produces:
  - `View`의 `candidates` 갈래: `{ kind: "candidates"; anchor; result; cuisines: Browse<Cuisine> }` (`candidates: Cuisine[]` 대체)
  - `View`의 `result` 갈래: `candidates: Cuisine[]` → `cuisines: Browse<Cuisine>` (돌아갈 때 그대로 넘김)
  - `CandidateScreen` props 추가: `canPrev: boolean`, `onPrev: () => void`, `canReshuffle: boolean`. `candidates` prop은 `currentPage(view.cuisines)`를 배열로 넘긴다.

- [ ] **Step 1: `page.tsx` 상태와 핸들러 바꾸기**

  - `start`: `cuisines: startBrowse(cuisines, CANDIDATE_COUNT, Math.random)`.
  - `reshuffle`: `browseNext(view.cuisines, distinctById(view.result.cuisines), CANDIDATE_COUNT, Math.random)`.
  - 새 `prevCandidates`: `browsePrev(view.cuisines)`.
  - `decideForMe`: `pickOne(currentPage(view.cuisines), Math.random)`.
  - `choose`·`backToCandidates`: `cuisines`를 그대로 옮긴다(위치 유지).
  - 쓰지 않게 된 `pickDistinct`·`pickAvoiding` import는 지운다.
  - `View` 주석(“candidates·result 갈래에 anchor·result를 들고 있는 것과 같은 이유”)의 필드 이름을 새 이름에 맞춘다.

- [ ] **Step 2: `CandidateScreen.tsx` 버튼**

  아래 묶음을 지금 `다시 뽑기` 자리에 둔다. `이전 후보`·`다시 뽑기`는 `canPrev`·`canReshuffle`이 거짓이면 `aria-disabled="true"`, 클릭은 무시(핸들러에서 return). 둘을 `grid grid-cols-2 gap-3`로 한 줄, `정해 주세요`는 그 아래 가로 가득.

  ```
  [ 이전 후보 ] [ 다시 뽑기 ]
  [ 못 고르겠어요, 정해 주세요 ]
  ```
  `role="status"` 알림 영역은 그대로 두면 `이전`으로 바뀐 목록도 읽힌다(바꾸지 않는다).

- [ ] **Step 3: `DESIGN.md`·`README.md` 반영**

  - `DESIGN.md` "후보 화면의 두 버튼" 항목을 "후보 화면의 버튼"으로 고친다: `이전 후보`·`다시 뽑기`(Quiet)는 한 줄에 반 폭씩, `정해 주세요`(Primary)는 가로 가득, 높이 48px·간격 12px. 2026-11-25 운영자 결정이며, 예전 비교(B·C안)와 유지 이유(정해 주세요를 낮추지 않음, 간격 기준)는 남긴다.
  - `README.md` 화면 ③ 그림의 `[ 다시 뽑기 ]` 줄을 `[ 이전 후보 ] [ 다시 뽑기 ]`로 바꾸고, 그림 아래에 "본 종류는 한 바퀴를 다 볼 때까지 다시 나오지 않고, `이전 후보`로 지나간 넷 묶음에 돌아갈 수 있다. 돌아간 뒤 `다시 뽑기`는 이미 본 묶음을 차례로 다시 지나간 뒤 새로 뽑는다"를 적는다.

- [ ] **Step 4: 검증**

  Run: `cd web && npm run lint && npm test`
  Expected: 둘 다 통과. (`npm run build`는 Task 4 끝에서 돌린다. 이 시점에는 결과 화면이 아직 `pickPlaces`를 쓴다.)

- [ ] **Step 5: 커밋**

  ```bash
  git add web/app/page.tsx web/components/CandidateScreen.tsx DESIGN.md README.md
  git commit -m "feat(web): 후보 화면에서 본 종류를 한 바퀴 동안 다시 안 보여 주고 이전 후보로 돌아간다"
  ```

**완료 조건:** `cd web && npm run lint && npm test` 통과.

---

### Task 4: 결과 화면에 기록과 `이전 가게` 연결

**Files:**
- Modify: `web/app/page.tsx` (`View`의 `result` 갈래, `choose`, `reshufflePlaces`, `toggleAvoid`, `ResultScreen` 렌더)
- Modify: `web/components/ResultScreen.tsx`
- Modify: `README.md` (화면 ④ 그림과 설명, "무작위 추첨을 브라우저가 하는 이유" 문단은 그대로 맞는지만 확인)
- Modify: `docs/todo.md` (1번 체크)

**Skills:** `vercel-react-best-practices`, `vercel-composition-patterns` (Step 1 전에 불러 기준을 확인한다. Task 3에서 정한 props 모양을 `ResultScreen`에도 같게 쓴다), `web-design-guidelines` (Step 6에서 감사)

**Interfaces:**
- Consumes: Task 2의 `startPlaces`, `nextPlaces`, `PlaceBrowse`; Task 1의 `browsePrev`, `currentPage`, `canGoBack`
- Produces:
  - `View`의 `result` 갈래: `places`·`windowSize` → `placeBrowse: PlaceBrowse`
  - `ResultScreen` props 추가: `canPrev: boolean`, `onPrev: () => void`. `places` prop은 `currentPage(view.placeBrowse.browse)`, `total`은 그대로 `view.pool.length`.

- [ ] **Step 1: `page.tsx`**

  - `choose`와 `toggleAvoid`: `placeBrowse: startPlaces(pool, PLACE_COUNT, Math.random)`. `toggleAvoid`는 `pool`이 바뀌므로 기록을 새로 시작한다(스펙 8절, 설계 작성자 판단).
  - `reshufflePlaces`: `nextPlaces(view.placeBrowse, view.pool, PLACE_COUNT, Math.random)`.
  - 새 `prevPlaces`: `{ ...view.placeBrowse, browse: browsePrev(view.placeBrowse.browse) }`.
  - `View` 주석 중 `places`·`windowSize`를 설명하던 줄을 `placeBrowse` 설명으로 바꾼다. "pool을 다시 걸러 만들지 말라"는 경고는 유지한다.

- [ ] **Step 2: `ResultScreen.tsx` 버튼**

  지금 `places.length < total`일 때만 그리던 `다른 가게 보기`를, 같은 조건에서 `[ 이전 가게 ] [ 다른 가게 보기 ]` 한 줄(`grid grid-cols-2 gap-3`)로 그린다. `이전 가게`는 `canPrev`가 거짓이면 `aria-disabled="true"`, 클릭 무시. 조건이 거짓이면 둘 다 그리지 않는다(지금과 같음). 아래 `다른 종류 고르기`·`처음부터 다시`는 그대로.

- [ ] **Step 3: 문서 반영**

  - `README.md` 화면 ④ 그림의 `[ 다른 가게 보기 ]` 줄을 `[ 이전 가게 ] [ 다른 가게 보기 ]`로 바꾸고, 가게도 한 바퀴 규칙과 `이전 가게`가 적용된다는 설명과 "`다시 넣기`·`다시 켜기`를 누르면 가게 기록은 처음부터"를 적는다.
  - `docs/todo.md` 1번 제목의 `- [ ]`를 `- [x]`로 바꾸고, 항목 끝에 "2026-11-25 완료. 설계: `docs/superpowers/specs/2026-11-25-browse-history-design.md`" 한 줄.

- [ ] **Step 4: 정적 검증**

  Run: `just check`
  Expected: 끝까지 통과(빌드·시험·tsc·lint).
  Run: `grep -rn "pickPlaces" web/ --include=*.ts --include=*.tsx`
  Expected: 출력 없음.

- [ ] **Step 5: 실제 화면 확인** (`just dev`, 휴대폰 폭 390px, `api/.env`의 카카오 키 사용)

  1. 후보 화면에서 `다시 뽑기`를 주변 종류가 다 나올 때까지 누른다 → 한 바퀴 안에서 중복 없음, 첫 화면에서 `이전 후보`가 흐림.
  2. `이전 후보` 두 번 → `다시 뽑기` 두 번 → 같은 묶음이 같은 순서로 다시 나오고, 그다음 누름에서만 새 묶음.
  3. 종류를 골라 결과 화면 → `다른 가게 보기` 두 번 → `다른 종류 고르기` → 후보 화면이 떠날 때 보던 묶음이고 `이전 후보` 상태도 그대로.
  4. 결과 화면에서 `다른 가게 보기` → `이전 가게` → 같은 가게 묶음. 회피로 빠진 곳이 있는 종류에서 `다시 넣기` → 가게 기록이 처음부터(`이전 가게` 흐림).

  각 확인 결과를 스크린샷이나 메모로 남긴다.

- [ ] **Step 6: 접근성·웹 표준 감사**

  `web-design-guidelines` 스킬로 `web/components/CandidateScreen.tsx`와 `web/components/ResultScreen.tsx`를 감사한다. 이번에 바꾼 부분(앞뒤 버튼 줄, `aria-disabled` 처리, `role="status"` 알림)에서 나온 지적은 고치고 Step 4를 다시 돌린다. 이번 변경과 무관한 기존 지적은 고치지 않고 완료 보고에 목록으로만 남긴다.
  Expected: 이번 변경 부분에 남은 지적 없음, `just check` 다시 통과.

- [ ] **Step 7: 커밋**

  ```bash
  # Step 6에서 CandidateScreen.tsx를 고쳤다면 함께 담는다
  git add web/app/page.tsx web/components/ResultScreen.tsx web/components/CandidateScreen.tsx README.md docs/todo.md
  git commit -m "feat(web): 결과 화면에서 본 가게를 한 바퀴 동안 다시 안 보여 주고 이전 가게로 돌아간다"
  ```

**완료 조건:** `just check` 통과, `pickPlaces` 잔재 없음, Step 5의 4개 항목 모두 기대대로, Step 6 감사에서 이번 변경 부분에 남은 지적 없음.
