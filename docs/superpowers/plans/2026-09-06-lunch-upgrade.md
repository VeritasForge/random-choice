# 점심 결정 서비스 고도화 실행 계획

> **에이전트 작업자에게:** 이 계획은 `superpowers:subagent-driven-development`(권장) 또는
> `superpowers:executing-plans`로 한 작업씩 실행합니다. 단계는 체크박스(`- [ ]`)로 추적합니다.

**목표:** 점심 결정 서비스가 "지난번에 보낸 곳으로 또 보내고, `한식` 한 장에 절반을 뭉치고,
술집을 섞고, 늘 같은 골목만 보는" 네 가지 문제를 고친다.

**접근:** 서버는 카카오 분류를 우리 자체 어휘로 옮기고 다섯 지점을 함께 조회한다.
화면은 사용자가 "여기로 정했어요"를 누른 가게를 브라우저에 기록해 다음에 뺀다.
저장소는 서버에 두지 않는다(카카오 정책). 마지막으로 디자인 컨셉을 한 번에 입힌다.

**기술 스택:** Go(표준 라이브러리만) · Next.js 16.3.3 · React 19 · Tailwind CSS 4 · vitest 4

**설계 문서:** `docs/superpowers/specs/2026-09-06-lunch-upgrade-design.md`
(이 계획은 그 문서를 근거로 삼습니다. 실행자는 둘 다 읽으십시오.)

---

## 전체에 걸리는 제약

이 절의 내용은 **모든 작업의 요구사항에 암묵적으로 포함됩니다.**

- **서버는 표준 라이브러리만 씁니다.** `api/go.mod`의 의존성 목록은 비어 있어야 합니다.
- **서버에 저장소(데이터베이스·캐시·파일)를 두지 않습니다.** 카카오 이용 정책 위반입니다.
- **브라우저에 저장하는 것은 세 가지뿐입니다** — 사용자가 "여기로 정했어요"를 누른 가게의
  `placeId`, `placeName`, 그리고 우리가 만든 날짜. **음식 종류는 저장하지 않습니다.**
- **화면 시험은 브라우저 없이 돕니다.** `web/vitest.config.mts`가 `environment: "node"`이고
  `jsdom`도 `@testing-library/react`도 설치되어 있지 않습니다. **새 의존성을 들이지 않습니다.**
  새 시험은 전부 `web/lib/` 아래 순수 함수 수준에 둡니다.
- **추첨 함수는 난수 생성기를 인자로 받습니다.** 저장소를 쓰는 함수도 저장소를 인자로 받습니다.
  그래야 시험에서 결과를 예측할 수 있습니다.
- **화면 접근성 처리를 깨뜨리지 않습니다** — 화면이 바뀌면 포커스를 새 화면 맨 위로 옮기고,
  로딩 중에도 버튼을 `disabled`로 만들지 않으며, 시작 화면을 한 자리에서만 그립니다.
- **시험을 만들 때 두 가지를 지킵니다.** ① 온전한 자료를 기준으로 두고 **한 항목씩만**
  어긋뜨립니다. ② 방어를 껐을 때 시험이 실제로 실패하는지 확인합니다.
- **검증 명령**: 서버는 `cd api && go test ./... && go vet ./...`,
  화면은 `cd web && npm run build && npm test && npx tsc --noEmit && npm run lint`.
  둘을 합친 것이 `just check`입니다. `npm run build`가 `npx tsc --noEmit`보다 **앞에**
  와야 합니다 — `app/layout.tsx`가 쓰는 `LayoutProps` 타입을 Next.js가 빌드하면서 만듭니다.
- **커밋 메시지는 한국어로, Conventional Commits 형식**으로 씁니다. 기존 이력을 따르십시오.

---

## 파일 구조

### 새로 만드는 것

| 파일 | 하나의 책임 |
|---|---|
| `api/internal/geo/geo.go` | 좌표 계산. 두 지점 사이 거리와 지점 오프셋 |
| `api/internal/geo/geo_test.go` | 위 시험 |
| `web/lib/visits.ts` | 정한 가게의 기록을 저장·조회·삭제. 저장소를 인자로 받는다 |
| `web/lib/visits.test.ts` | 위 시험 |
| `web/lib/avoid.ts` | 기록을 근거로 가게를 걸러 낸다. 몇 곳을 걸렀는지 함께 돌려준다 |
| `web/lib/avoid.test.ts` | 위 시험 |
| `web/lib/reasons.ts` | 도보 시간과 안내 문구를 만든다 |
| `web/lib/reasons.test.ts` | 위 시험 |
| `web/components/VisitsScreen.tsx` | 정한 곳 목록, 지우기, 회피 스위치 |

`api/internal/geo`를 새 패키지로 두는 이유는 저장소에 지리 계산 코드가 한 줄도 없기
때문입니다(`web/lib/geo.ts`는 브라우저에 위치를 묻기만 합니다). 순수 계산이라 바깥과 닿지
않고, `cuisine` 패키지와 같은 자리에 놓입니다.

### 고치는 것

| 파일 | 무엇을 |
|---|---|
| `api/internal/cuisine/cuisine.go` | `Extract` → `Classify`. 자체 어휘 규칙 목록 |
| `api/internal/cuisine/cuisine_test.go` | 시험표를 새 규칙에 맞춤 |
| `api/internal/kakao/client.go` | `SearchAround` 추가. 거리 재계산, 중복 제거 |
| `api/internal/kakao/client_test.go` | 위 시험 |
| `api/internal/httpapi/handler.go` | 응답 형태, 버리는 이유 두 가지를 따로 셈 |
| `api/internal/httpapi/handler_test.go` | 위 시험 |
| `web/lib/api.ts` | `Place.cuisineId`, `Cuisine{id,label}`, 항목 검사 |
| `web/lib/api.test.ts` | 위 시험 |
| `web/lib/places.ts` | 가까운 여덟 곳 창 안에서 뽑기 |
| `web/lib/places.test.ts` | 위 시험 |
| `web/app/page.tsx` | 기록·회피·이유를 화면에 붙임 |
| `web/components/ResultScreen.tsx` | 도보 시간, `여기로 정했어요`, 안내 줄 |
| `web/components/CandidateScreen.tsx` | 카드에 곳 수 표시 |
| `web/components/StartScreen.tsx` | `최근 기록 보기` 링크 |
| `web/components/Notice.tsx` | 빈 결과 문구에서 반경 제거 |
| `web/app/globals.css` | 디자인 토큰 |
| `web/app/layout.tsx` | 시스템 글꼴 스택 |
| `README.md` | 달라진 동작과 한계 |

---

## 작업 순서

```
작업 1 (자체 어휘) ─┐
                    ├─▶ 작업 4 (응답 형태) ─▶ 작업 5 (화면 타입) ─┐
작업 2 (좌표 계산) ─┴─▶ 작업 3 (다섯 지점) ─┘                     │
                                                                  ▼
작업 6 (가까운 창) ─▶ 작업 7 (기록) ─▶ 작업 8 (회피) ─▶ 작업 9 (이유) ─▶ 작업 10 (화면 조립)
                                                                              │
                                                                              ▼
                                                                    작업 11 (디자인) ─▶ 작업 12 (문서)
```

작업 1과 2는 서로 기대지 않으므로 순서를 바꿔도 됩니다. 나머지는 순서를 지켜야 합니다.

---

### 작업 1: 자체 음식 종류 어휘

**파일:**
- 고침: `api/internal/cuisine/cuisine.go`
- 시험: `api/internal/cuisine/cuisine_test.go`

**인터페이스:**
- 쓰는 것: 없음
- 내놓는 것:
  ```go
  type Cuisine struct {
      ID    string // 저장·대조에 쓰는 식별자
      Label string // 화면에 보이는 이름
  }
  // Classify는 카카오 분류 문자열을 우리 어휘로 옮긴다.
  // ok가 false면 그 가게를 결과에서 뺀다. 이유는 Reason으로 구분한다.
  func Classify(categoryName string) (c Cuisine, ok bool)
  // ClassifyWithReason은 뺄 때 그 이유까지 돌려준다.
  func ClassifyWithReason(categoryName string) (c Cuisine, ok bool, reason DropReason)
  type DropReason int
  const (
      DropNone     DropReason = iota // 뺀 것이 아니다
      DropNotLunch                   // 점심 대상이 아니다(술집·아이스크림 등). 의도한 동작
      DropNoRule                     // 맞는 규칙이 없다. 어휘에 구멍이 있다는 신호
  )
  // Tally 하나는 음식 종류 하나와 그 종류에 해당하는 가게 수다. (기존과 같음)
  type Tally struct {
      Cuisine Cuisine
      Count   int
  }
  func CountBy(cuisines []Cuisine) []Tally
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`api/internal/cuisine/cuisine_test.go`를 아래로 **통째로 바꿉니다.**

```go
package cuisine

import "testing"

// 실제 카카오 응답에서 뽑은 문자열들이다. 2026-09-06에 네 지역 889곳을 조회해 확인했다.
func TestClassify(t *testing.T) {
	tests := []struct {
		name     string
		category string
		wantID   string
		wantOK   bool
	}{
		// 한식이 뭉치던 문제를 푸는 자리. 여기가 이 작업의 핵심이다.
		{"하위가 없는 한식은 밥집", "음식점 > 한식", "bapjip", true},
		{"찌개도 밥집", "음식점 > 한식 > 찌개,전골", "bapjip", true},
		{"육류고기는 고기구이", "음식점 > 한식 > 육류,고기", "gogi", true},
		{"곱창도 고기구이", "음식점 > 한식 > 육류,고기 > 곱창,막창", "gogi", true},
		{"닭요리는 고기구이가 아니다", "음식점 > 한식 > 육류,고기 > 닭요리", "dak", true},
		{"삼계탕도 닭요리", "음식점 > 한식 > 육류,고기 > 닭요리 > 삼계탕", "dak", true},
		{"치킨도 닭요리", "음식점 > 치킨", "dak", true},
		{"해물생선은 회해물", "음식점 > 한식 > 해물,생선", "hoe", true},
		{"국수는 면국수", "음식점 > 한식 > 국수", "myeon", true},
		{"냉면도 면국수", "음식점 > 한식 > 냉면", "myeon", true},
		{"일본식라면도 면국수", "음식점 > 일식 > 일본식라면", "myeon", true},
		{"국밥은 국밥탕", "음식점 > 한식 > 국밥", "gukbap", true},
		{"감자탕도 국밥탕", "음식점 > 한식 > 감자탕", "gukbap", true},

		// 나머지 갈래
		{"돈까스우동은 따로", "음식점 > 일식 > 돈까스,우동", "donkatsu", true},
		{"초밥은 일식", "음식점 > 일식 > 초밥,롤", "ilsik", true},
		{"하위가 없는 일식", "음식점 > 일식", "ilsik", true},
		{"중국요리는 중식", "음식점 > 중식 > 중국요리", "jungsik", true},
		{"햄버거는 따로", "음식점 > 양식 > 햄버거", "burger", true},
		{"패스트푸드도 햄버거", "음식점 > 패스트푸드 > 맥도날드", "burger", true},
		{"샌드위치는 샐러드쪽", "음식점 > 패스트푸드 > 샌드위치 > 써브웨이", "salad", true},
		{"이탈리안은 양식", "음식점 > 양식 > 이탈리안", "yangsik", true},
		{"베트남음식은 아시아", "음식점 > 아시아음식 > 동남아음식 > 베트남음식", "asia", true},
		{"제과베이커리는 빵간식", "음식점 > 간식 > 제과,베이커리", "bbang", true},
		{"브랜드명이 붙어도 같다", "음식점 > 간식 > 제과,베이커리 > 파리바게뜨", "bbang", true},
		{"구내식당은 밥집", "음식점 > 구내식당", "bapjip", true},

		// 점심 대상이 아닌 것
		{"술집은 뺀다", "음식점 > 술집", "", false},
		{"칵테일바도 뺀다", "음식점 > 술집 > 칵테일바", "", false},
		{"호프요리주점도 뺀다", "음식점 > 술집 > 호프,요리주점", "", false},
		{"아이스크림은 점심이 아니다", "음식점 > 간식 > 아이스크림", "", false},
		{"떡한과도 점심이 아니다", "음식점 > 간식 > 떡,한과", "", false},

		// 규칙이 없는 것
		{"하위가 없으면 종류를 알 수 없다", "음식점", "", false},
		{"빈 문자열", "", "", false},
		{"모르는 분류", "음식점 > 우주음식", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := Classify(tt.category)
			if ok != tt.wantOK {
				t.Fatalf("Classify(%q) ok = %v, want %v", tt.category, ok, tt.wantOK)
			}
			if got.ID != tt.wantID {
				t.Errorf("Classify(%q) ID = %q, want %q", tt.category, got.ID, tt.wantID)
			}
			if tt.wantOK && got.Label == "" {
				t.Errorf("Classify(%q)가 빈 이름을 돌려줬다. 화면에 글자 없는 카드가 그려진다", tt.category)
			}
		})
	}
}

// 버리는 이유를 나누지 않으면, 매 요청마다 14%씩 생기는 "점심 아님"이
// "어휘에 구멍이 있다"는 드문 신호를 덮어 버린다.
func TestClassifyWithReasonSeparatesDropCauses(t *testing.T) {
	if _, _, r := ClassifyWithReason("음식점 > 술집"); r != DropNotLunch {
		t.Errorf("술집의 이유 = %v, want DropNotLunch", r)
	}
	if _, _, r := ClassifyWithReason("음식점 > 우주음식"); r != DropNoRule {
		t.Errorf("모르는 분류의 이유 = %v, want DropNoRule", r)
	}
	if _, _, r := ClassifyWithReason("음식점 > 한식"); r != DropNone {
		t.Errorf("정상 분류의 이유 = %v, want DropNone", r)
	}
}

// 어떤 규칙의 조각들이 그보다 앞에 있는 규칙으로 시작하면, 뒤의 규칙은
// 영영 쓰이지 않는 죽은 코드가 된다. 사람 눈으로 볼 일이 아니라 시험이 할 일이다.
func TestNoRuleIsShadowedByAnEarlierOne(t *testing.T) {
	for i, later := range rules {
		for j, earlier := range rules[:i] {
			if len(earlier.pattern) > len(later.pattern) {
				continue
			}
			shadowed := true
			for k, seg := range earlier.pattern {
				if later.pattern[k] != seg {
					shadowed = false
					break
				}
			}
			if shadowed {
				t.Errorf("규칙 %d(%v)가 규칙 %d(%v)에 가려 영영 쓰이지 않는다. 긴 규칙을 앞으로 옮겨라",
					i, later.pattern, j, earlier.pattern)
			}
		}
	}
}

// 어휘가 실제로 다 도달 가능한지 확인한다. 도달 못 하는 어휘는 화면에 영영 안 나온다.
func TestEveryCuisineIsReachable(t *testing.T) {
	reached := map[string]bool{}
	for _, r := range rules {
		if r.cuisine.ID != "" {
			reached[r.cuisine.ID] = true
		}
	}
	if len(reached) < 18 {
		t.Errorf("도달 가능한 어휘가 %d가지뿐이다. 설계는 18가지다", len(reached))
	}
}

func TestCountBy(t *testing.T) {
	got := CountBy([]Cuisine{
		{ID: "gogi", Label: "고기·구이"},
		{ID: "bapjip", Label: "밥집·백반"},
		{ID: "gogi", Label: "고기·구이"},
	})
	if len(got) != 2 {
		t.Fatalf("종류 수 = %d, want 2", len(got))
	}
	// 많은 순으로, 같으면 ID 오름차순으로. 같은 입력이면 언제나 같은 순서여야 시험할 수 있다.
	if got[0].Cuisine.ID != "gogi" || got[0].Count != 2 {
		t.Errorf("첫째 = %+v, want gogi 2곳", got[0])
	}
	if got[1].Cuisine.ID != "bapjip" || got[1].Count != 1 {
		t.Errorf("둘째 = %+v, want bapjip 1곳", got[1])
	}
}
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd api && go test ./internal/cuisine/ 2>&1 | head -20`
예상: 컴파일 실패. `undefined: Classify`, `undefined: rules` 등.

- [ ] **단계 3: 최소 구현을 쓴다**

`api/internal/cuisine/cuisine.go`를 아래로 **통째로 바꿉니다.**
규칙표의 근거는 설계 문서 부록에 있습니다(실측 664곳으로 검증).

```go
// Package cuisine은 카카오가 주는 분류 문자열을 우리 자체 음식 종류로 옮긴다.
//
// 왜 카카오 문자열을 그대로 쓰지 않는가:
//  1. 카카오는 분류 문자열의 저장을 금지한다. 우리 어휘의 식별자는 우리가 만든 것이라
//     저장할 수 있다(설계 문서 9절).
//  2. 카카오 분류를 맨 앞 한 조각만 쓰면 "한식" 한 장에 주변의 최대 47%가 몰린다.
//     두 조각을 쓰면 "한식"과 "한식 > 육류,고기"가 서로 다른 카드로 갈라진다.
//     우리 어휘로 옮기면 두 문제가 함께 풀린다.
package cuisine

import (
	"sort"
	"strings"
)

// rootCategory는 모든 음식점에 똑같이 붙는 맨 앞 조각이라 정보가 없다.
const rootCategory = "음식점"

// Cuisine 하나는 우리가 정의한 음식 종류다. 카카오 분류와 독립적이다.
type Cuisine struct {
	ID    string // 저장·대조에 쓰는 식별자. 카카오 데이터가 아니므로 저장해도 된다
	Label string // 화면에 보이는 이름
}

// DropReason은 가게를 결과에서 뺀 이유다.
//
// 둘을 나누는 이유: "점심 대상 아님"은 실측에서 14%였고 거의 매 요청마다 생기는
// 의도된 동작이다. "맞는 규칙 없음"은 실측 664곳 중 3곳뿐이었지만 우리 어휘에
// 구멍이 있다는 신호다. 한 숫자로 합치면 흔한 쪽이 드문 쪽을 덮어 버린다.
type DropReason int

const (
	DropNone     DropReason = iota // 뺀 것이 아니다
	DropNotLunch                   // 점심 대상이 아니다. 의도한 동작
	DropNoRule                     // 맞는 규칙이 없다. 어휘에 구멍이 있다는 신호
)

type rule struct {
	pattern []string // 음식점을 뗀 뒤의 조각들과 앞에서부터 맞춰 본다
	cuisine Cuisine  // ID가 비어 있으면 점심 대상이 아니라는 뜻이다
}

// rules는 우리 어휘 전체다. 이 목록이 카카오와 우리를 가르는 경계다.
//
// **순서가 규칙의 일부다.** 위에서부터 맞춰 보고 가장 먼저 맞는 것을 쓰므로,
// 조각이 긴 규칙이 짧은 규칙보다 앞에 있어야 한다. 어기면 뒤의 규칙이 영영
// 쓰이지 않는 죽은 코드가 된다 — cuisine_test.go가 그것을 지킨다.
//
// 규칙과 맞춘 뒤 남는 조각은 보지 않는다. 그 자리에 오는 것은 대개 브랜드명
// (파리바게뜨·맥도날드·죠스떡볶이)이라 종류를 가르는 데 쓸모가 없다.
var rules = []rule{
	// 점심이 아닌 것. 판정 기준은 "이것만 먹고 점심을 때울 수 있는가" 하나다.
	// 술집을 통째로 빼는 이유: 실측에서 14%였고 그 안에 위스키온더락·칵테일바가 있다.
	// 낮에 위스키바를 권하면 그 한 번으로 신뢰가 무너진다.
	{[]string{"술집"}, Cuisine{}},
	{[]string{"간식", "아이스크림"}, Cuisine{}},
	{[]string{"간식", "도넛"}, Cuisine{}},
	{[]string{"간식", "떡,한과"}, Cuisine{}},

	// 한식을 쪼갠다. 지금 한 장에 최대 47%가 몰려 있던 자리다.
	{[]string{"한식", "육류,고기", "닭요리"}, Cuisine{"dak", "닭요리"}},
	{[]string{"한식", "육류,고기"}, Cuisine{"gogi", "고기·구이"}},
	{[]string{"한식", "해물,생선"}, Cuisine{"hoe", "회·해물"}},
	{[]string{"한식", "국수"}, Cuisine{"myeon", "면·국수"}},
	{[]string{"한식", "냉면"}, Cuisine{"myeon", "면·국수"}},
	{[]string{"한식", "국밥"}, Cuisine{"gukbap", "국밥·탕"}},
	{[]string{"한식", "감자탕"}, Cuisine{"gukbap", "국밥·탕"}},
	{[]string{"한식", "순대"}, Cuisine{"gukbap", "국밥·탕"}},
	{[]string{"한식", "찌개,전골"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"한식", "한정식"}, Cuisine{"bapjip", "밥집·백반"}},
	// 하위가 없는 한식은 정보가 없는 것이 아니라 그 자체가 한 종류다.
	// 실측에서 이 그룹의 상호는 오맛난집·미진식당·봉된장·수미정이었다.
	{[]string{"한식"}, Cuisine{"bapjip", "밥집·백반"}},

	// 나머지 갈래
	{[]string{"일식", "돈까스,우동"}, Cuisine{"donkatsu", "돈까스·우동"}},
	{[]string{"일식", "일본식라면"}, Cuisine{"myeon", "면·국수"}},
	{[]string{"일식"}, Cuisine{"ilsik", "일식·초밥"}},
	{[]string{"중식"}, Cuisine{"jungsik", "중식"}},
	{[]string{"분식"}, Cuisine{"bunsik", "분식"}},
	{[]string{"치킨"}, Cuisine{"dak", "닭요리"}},
	{[]string{"양식", "햄버거"}, Cuisine{"burger", "햄버거"}},
	{[]string{"양식"}, Cuisine{"yangsik", "양식·파스타"}},
	{[]string{"패스트푸드", "샌드위치"}, Cuisine{"salad", "샐러드·샌드위치"}},
	{[]string{"패스트푸드"}, Cuisine{"burger", "햄버거"}},
	{[]string{"샐러드"}, Cuisine{"salad", "샐러드·샌드위치"}},
	{[]string{"아시아음식"}, Cuisine{"asia", "아시아 음식"}},
	{[]string{"샤브샤브"}, Cuisine{"shabu", "샤브샤브"}},
	{[]string{"퓨전요리"}, Cuisine{"fusion", "퓨전"}},
	{[]string{"도시락"}, Cuisine{"dosirak", "도시락"}},
	{[]string{"뷔페"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"구내식당"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"기사식당"}, Cuisine{"bapjip", "밥집·백반"}},
	{[]string{"패밀리레스토랑"}, Cuisine{"yangsik", "양식·파스타"}},
	// 빵집은 샌드위치·샐러드도 팔아 점심이 되지만, 아이스크림 한 통은 점심이 아니다.
	// 그래서 위에서 아이스크림·도넛·떡한과를 먼저 뺀 뒤 나머지 간식만 남긴다.
	{[]string{"간식"}, Cuisine{"bbang", "빵·간식"}},
}

func segments(categoryName string) []string {
	var segs []string
	for _, part := range strings.Split(categoryName, ">") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			segs = append(segs, trimmed)
		}
	}
	if len(segs) > 0 && segs[0] == rootCategory {
		segs = segs[1:]
	}
	return segs
}

// Classify는 카카오 분류 문자열을 우리 어휘로 옮긴다.
// 점심 대상이 아니거나 맞는 규칙이 없으면 ok가 false다.
func Classify(categoryName string) (Cuisine, bool) {
	c, ok, _ := ClassifyWithReason(categoryName)
	return c, ok
}

// ClassifyWithReason은 뺄 때 그 이유까지 돌려준다. 부르는 쪽이 이유별로 따로 세도록.
func ClassifyWithReason(categoryName string) (Cuisine, bool, DropReason) {
	segs := segments(categoryName)
	for _, r := range rules {
		if len(r.pattern) > len(segs) {
			continue
		}
		matched := true
		for i, seg := range r.pattern {
			if segs[i] != seg {
				matched = false
				break
			}
		}
		if !matched {
			continue
		}
		if r.cuisine.ID == "" {
			return Cuisine{}, false, DropNotLunch
		}
		return r.cuisine, true, DropNone
	}
	return Cuisine{}, false, DropNoRule
}

// Tally 하나는 음식 종류 하나와 그 종류에 해당하는 가게 수다.
type Tally struct {
	Cuisine Cuisine
	Count   int
}

// CountBy는 음식 종류별 가게 수를 센다.
// 가게 수가 많은 순으로, 같으면 식별자 오름차순으로 정렬한다 —
// 같은 입력이면 언제나 같은 순서가 나와야 시험할 수 있기 때문이다.
func CountBy(cuisines []Cuisine) []Tally {
	counts := make(map[Cuisine]int, len(cuisines))
	for _, c := range cuisines {
		counts[c]++
	}
	tallies := make([]Tally, 0, len(counts))
	for c, n := range counts {
		tallies = append(tallies, Tally{Cuisine: c, Count: n})
	}
	sort.Slice(tallies, func(i, j int) bool {
		if tallies[i].Count != tallies[j].Count {
			return tallies[i].Count > tallies[j].Count
		}
		return tallies[i].Cuisine.ID < tallies[j].Cuisine.ID
	})
	return tallies
}
```

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd api && go test ./internal/cuisine/ -v 2>&1 | tail -20`
예상: 전부 PASS.

`httpapi`가 아직 `Extract`를 부르므로 `go build ./...`는 실패합니다. 작업 4에서 고칩니다.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`rules`에서 `{[]string{"한식", "육류,고기"}, ...}` 줄을 잠시 `{[]string{"한식"}, ...}` 줄
**뒤로** 옮기고 시험을 돌립니다.

실행: `cd api && go test ./internal/cuisine/ -run Shadowed -v`
예상: **FAIL** — "규칙 N이 규칙 M에 가려 영영 쓰이지 않는다".

확인한 뒤 원래대로 되돌리고 다시 통과하는지 봅니다. 되돌리는 것을 잊지 마십시오.

- [ ] **단계 6: 커밋한다**

```bash
git add api/internal/cuisine/
git commit -m "feat(api): 카카오 분류를 우리 자체 음식 종류로 옮기는 규칙

한 조각만 쓰던 규칙을 자체 어휘 18가지로 바꿨다. 실측에서 '한식' 한 장이
상계역 기준 225곳 중 106곳(47%)을 뭉치고 있었는데, 밥집·고기·닭·국밥·면·회로
나뉜다. 점심에 맞지 않는 술집(실측 14%)과 아이스크림·떡한과도 뺀다.

버리는 이유를 둘로 나눠 센다. '점심 대상 아님'은 매번 생기는 의도된 동작이고
'맞는 규칙 없음'은 어휘에 구멍이 있다는 드문 신호라, 합치면 흔한 쪽이 드문
쪽을 덮는다.

규칙 순서가 규칙의 일부이므로, 앞선 규칙에 가려지는 규칙이 없는지 시험이
지킨다. 규칙 하나를 일부러 뒤로 옮겨 그 시험이 실제로 실패하는 것을 확인했다."
```

---

### 작업 2: 좌표 계산

**파일:**
- 만듦: `api/internal/geo/geo.go`
- 시험: `api/internal/geo/geo_test.go`

**인터페이스:**
- 쓰는 것: 없음
- 내놓는 것:
  ```go
  // DistanceMeters는 두 좌표 사이의 거리를 미터로 돌려준다.
  func DistanceMeters(lat1, lng1, lat2, lng2 float64) float64
  // Offset은 기준 좌표에서 북쪽 northM, 동쪽 eastM 떨어진 좌표를 돌려준다.
  // 음수를 넣으면 남쪽·서쪽이다.
  func Offset(lat, lng, northM, eastM float64) (float64, float64)
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`api/internal/geo/geo_test.go`를 만듭니다.

```go
package geo

import (
	"math"
	"testing"
)

// 카카오가 준 거리와 우리 계산이 맞는지 실측으로 대조했다(2026-09-06).
// 강남역(37.4979, 127.0276)에서 북쪽 400m 지점으로 조회했을 때,
// 카카오는 '소보키 강남점'까지 24m라고 답했고 우리 계산도 25m였다.
// 같은 가게를 사용자 원위치에서 재면 412m다 — 이 차이가 이 패키지가 있는 이유다.
func TestDistanceMeters(t *testing.T) {
	tests := []struct {
		name                   string
		lat1, lng1, lat2, lng2 float64
		want                   float64
		tolerance              float64
	}{
		{"같은 점은 0", 37.4979, 127.0276, 37.4979, 127.0276, 0, 0.01},
		{"북쪽 400m", 37.4979, 127.0276, 37.4979 + 400/111320.0, 127.0276, 400, 1},
		{"강남역에서 소보키 강남점", 37.4979, 127.0276, 37.50151, 127.02785, 402, 15},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DistanceMeters(tt.lat1, tt.lng1, tt.lat2, tt.lng2)
			if math.Abs(got-tt.want) > tt.tolerance {
				t.Errorf("DistanceMeters = %.1fm, want %.1fm ± %.1f", got, tt.want, tt.tolerance)
			}
		})
	}
}

// 거리는 방향을 바꿔도 같아야 한다. 아니면 어느 쪽을 넣느냐에 따라 답이 달라진다.
func TestDistanceIsSymmetric(t *testing.T) {
	a := DistanceMeters(37.4979, 127.0276, 37.5563, 126.9236)
	b := DistanceMeters(37.5563, 126.9236, 37.4979, 127.0276)
	if math.Abs(a-b) > 0.01 {
		t.Errorf("방향에 따라 거리가 다르다: %.3f vs %.3f", a, b)
	}
}

func TestOffset(t *testing.T) {
	const lat, lng = 37.4979, 127.0276

	t.Run("북쪽으로 옮기면 위도만 커진다", func(t *testing.T) {
		gotLat, gotLng := Offset(lat, lng, 400, 0)
		if gotLat <= lat {
			t.Errorf("위도가 커지지 않았다: %f -> %f", lat, gotLat)
		}
		if math.Abs(gotLng-lng) > 1e-9 {
			t.Errorf("경도가 움직였다: %f -> %f", lng, gotLng)
		}
		if d := DistanceMeters(lat, lng, gotLat, gotLng); math.Abs(d-400) > 1 {
			t.Errorf("옮긴 거리 = %.1fm, want 400m", d)
		}
	})

	t.Run("동쪽으로 옮기면 경도만 커진다", func(t *testing.T) {
		gotLat, gotLng := Offset(lat, lng, 0, 400)
		if gotLng <= lng {
			t.Errorf("경도가 커지지 않았다: %f -> %f", lng, gotLng)
		}
		if math.Abs(gotLat-lat) > 1e-9 {
			t.Errorf("위도가 움직였다: %f -> %f", lat, gotLat)
		}
		if d := DistanceMeters(lat, lng, gotLat, gotLng); math.Abs(d-400) > 1 {
			t.Errorf("옮긴 거리 = %.1fm, want 400m", d)
		}
	})

	t.Run("음수는 반대 방향", func(t *testing.T) {
		southLat, _ := Offset(lat, lng, -400, 0)
		if southLat >= lat {
			t.Errorf("남쪽으로 가지 않았다: %f -> %f", lat, southLat)
		}
	})

	// 경도 1도의 실제 거리는 위도에 따라 다르다. 위도를 무시하면 북쪽으로 갈수록
	// 동서 이동 거리가 커져, 서울에서 400m를 요청해도 500m 넘게 옮겨진다.
	t.Run("위도가 높을수록 같은 경도 차이가 짧은 거리다", func(t *testing.T) {
		_, seoulLng := Offset(37.5, 127.0, 0, 400)
		_, jejuLng := Offset(33.5, 126.5, 0, 400)
		seoulDelta := seoulLng - 127.0
		jejuDelta := jejuLng - 126.5
		if seoulDelta <= jejuDelta {
			t.Errorf("위도 보정이 없다: 서울 %g, 제주 %g", seoulDelta, jejuDelta)
		}
	})
}
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd api && go test ./internal/geo/ 2>&1 | head -10`
예상: `no required module provides package` 또는 컴파일 실패.

- [ ] **단계 3: 최소 구현을 쓴다**

`api/internal/geo/geo.go`를 만듭니다.

```go
// Package geo는 좌표 계산만 한다. 바깥과 닿지 않는 순수 계산이다.
//
// 이 패키지가 있는 이유: 조회 지점을 사용자 위치 밖으로 옮기면 카카오가 주는 거리가
// 사용자 기준이 아니게 된다. 2026-09-06 실측에서 400m 옮긴 지점으로 조회하니
// 카카오는 24m라고 답했지만 사용자 원위치에서는 412m였다 — 17배 차이다.
// 그 값을 그대로 화면에 쓰면 "너무 멀어"라는 불만을 우리가 직접 만든다.
package geo

import "math"

// earthRadiusM은 지구 반지름(미터)이다. 국제 측지 기준의 평균값을 쓴다.
const earthRadiusM = 6_371_000.0

// metersPerDegreeLat은 위도 1도의 거리(미터)다. 위도와 무관하게 거의 일정하다.
const metersPerDegreeLat = 111_320.0

// DistanceMeters는 두 좌표 사이의 대권 거리를 미터로 돌려준다(하버사인).
//
// 평면으로 근사하지 않는 이유: 우리가 다루는 거리는 1km 안쪽이라 평면 근사로도
// 오차가 작지만, 공식을 단순하게 두면 나중에 더 먼 거리에 쓰였을 때 조용히 틀린다.
// 하버사인은 거리와 무관하게 맞고, 계산 비용도 문제가 되지 않는다.
func DistanceMeters(lat1, lng1, lat2, lng2 float64) float64 {
	p1 := lat1 * math.Pi / 180
	p2 := lat2 * math.Pi / 180
	dp := (lat2 - lat1) * math.Pi / 180
	dl := (lng2 - lng1) * math.Pi / 180

	a := math.Sin(dp/2)*math.Sin(dp/2) +
		math.Cos(p1)*math.Cos(p2)*math.Sin(dl/2)*math.Sin(dl/2)
	return 2 * earthRadiusM * math.Asin(math.Sqrt(a))
}

// Offset은 기준 좌표에서 북쪽 northM, 동쪽 eastM 떨어진 좌표를 돌려준다.
// 음수를 넣으면 남쪽·서쪽이다.
//
// 경도 계산에 위도를 반영하는 이유: 경도 1도의 실제 거리는 적도에서 가장 길고
// 극으로 갈수록 짧아진다. 무시하면 북쪽 지역일수록 동서로 더 멀리 옮겨진다.
func Offset(lat, lng, northM, eastM float64) (float64, float64) {
	metersPerDegreeLng := metersPerDegreeLat * math.Cos(lat*math.Pi/180)
	return lat + northM/metersPerDegreeLat, lng + eastM/metersPerDegreeLng
}
```

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd api && go test ./internal/geo/ -v 2>&1 | tail -20`
예상: 전부 PASS.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`Offset`의 `metersPerDegreeLng`를 `metersPerDegreeLat`으로 바꿔(위도 보정 제거)
시험을 돌립니다.

실행: `cd api && go test ./internal/geo/ -run Offset -v`
예상: **FAIL** — "위도 보정이 없다".

확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add api/internal/geo/
git commit -m "feat(api): 좌표 사이 거리와 지점 오프셋 계산 추가

조회 지점을 사용자 위치 밖으로 옮기면 카카오가 주는 거리가 사용자 기준이
아니게 된다. 실측(2026-09-06)에서 400m 옮긴 지점의 '소보키 강남점'을 카카오는
24m라고 답했지만 사용자 원위치에서는 412m였다.

경도 계산에 위도를 반영한다. 무시하면 북쪽 지역일수록 동서로 더 멀리
옮겨지는데, 그 보정을 빼면 시험이 실패하는 것을 확인했다."
```

---

### 작업 3: 다섯 지점을 함께 조회

**파일:**
- 고침: `api/internal/kakao/client.go`
- 시험: `api/internal/kakao/client_test.go`

**인터페이스:**
- 쓰는 것: `geo.DistanceMeters`, `geo.Offset` (작업 2)
- 내놓는 것:
  ```go
  // SearchAround는 사용자 위치와 그 둘레 네 지점을 조회해 합친다.
  // 모든 Place.Distance는 사용자가 준 lat,lng 기준으로 다시 계산된 값이다.
  func (c *Client) SearchAround(ctx context.Context, lat, lng float64, radius int) ([]Place, error)
  ```

**설계 근거(설계 문서 4-3·7-2절):** 카카오는 한 조회에 가까운 45곳만 준다. 사람이 많은
곳에서는 그 45곳이 반경 100~160m 안에 다 들어가서, 반경을 넓혀도 목록이 같다.
중심을 400m 옮기면 실측 네 지역 모두 **겹치는 가게가 0곳**이었고 45곳이 약 220곳이 됐다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

`api/internal/kakao/client_test.go` **끝에** 아래를 덧붙입니다. 기존 시험은 그대로 둡니다.

```go
// 다섯 지점을 조회하면 각 지점의 결과가 합쳐져야 한다.
func TestSearchAroundMergesAllPoints(t *testing.T) {
	var mu sync.Mutex
	seenPoints := map[string]bool{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		x := r.URL.Query().Get("x")
		y := r.URL.Query().Get("y")
		mu.Lock()
		seenPoints[x+","+y] = true
		id := len(seenPoints)
		mu.Unlock()
		// 지점마다 서로 다른 가게 하나씩. 좌표는 요청한 지점 그대로 둔다.
		writeJSON(t, w, fmt.Sprintf(`{"documents":[
			{"id":"p%d","place_name":"가게%d","category_name":"음식점 > 한식",
			 "phone":"","address_name":"","road_address_name":"길%d","place_url":"",
			 "x":%q,"y":%q,"distance":"10"}],"meta":{"is_end":true}}`, id, id, id, x, y))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	places, err := client.SearchAround(context.Background(), 37.4979, 127.0276, 500)
	if err != nil {
		t.Fatalf("SearchAround = %v", err)
	}
	if len(places) != 5 {
		t.Fatalf("받은 가게 %d곳, want 5곳 (지점마다 하나씩)", len(places))
	}
	if len(seenPoints) != 5 {
		t.Errorf("조회한 지점 %d곳, want 5곳", len(seenPoints))
	}
}

// 이 시험이 이 작업에서 가장 중요하다.
// 카카오가 준 distance는 조회 중심 기준이라, 그대로 쓰면 412m가 24m로 표시된다.
func TestSearchAroundRecomputesDistanceFromUserPosition(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		x := r.URL.Query().Get("x")
		y := r.URL.Query().Get("y")
		// 어느 지점을 물어도 그 지점 바로 위의 가게를 주고, 거리는 5m라고 답한다.
		writeJSON(t, w, fmt.Sprintf(`{"documents":[
			{"id":%q,"place_name":"가게","category_name":"음식점 > 한식",
			 "phone":"","address_name":"","road_address_name":"길","place_url":"",
			 "x":%q,"y":%q,"distance":"5"}],"meta":{"is_end":true}}`, x+y, x, y))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	places, err := client.SearchAround(context.Background(), userLat, userLng, 500)
	if err != nil {
		t.Fatalf("SearchAround = %v", err)
	}

	var far int
	for _, p := range places {
		if p.Distance > far {
			far = p.Distance
		}
	}
	// 둘레 지점은 사용자로부터 400m 떨어져 있다. 카카오가 5m라고 답했어도
	// 우리는 400m 가까운 값을 돌려줘야 한다.
	if far < 350 {
		t.Errorf("가장 먼 가게가 %dm다. 카카오가 준 거리를 그대로 쓰고 있다 — "+
			"둘레 지점은 사용자로부터 400m 떨어져 있으므로 400m 안팎이 나와야 한다", far)
	}
}

// 실측에서는 겹침이 0이었지만, 음식점이 드문 곳에서는 원이 겹칠 수 있다.
func TestSearchAroundRemovesDuplicatesByID(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 어느 지점을 물어도 같은 가게를 준다.
		writeJSON(t, w, `{"documents":[
			{"id":"same","place_name":"같은가게","category_name":"음식점 > 한식",
			 "phone":"","address_name":"","road_address_name":"길","place_url":"",
			 "x":"127.0276","y":"37.4979","distance":"10"}],"meta":{"is_end":true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	places, err := client.SearchAround(context.Background(), 37.4979, 127.0276, 500)
	if err != nil {
		t.Fatalf("SearchAround = %v", err)
	}
	if len(places) != 1 {
		t.Errorf("같은 가게가 %d번 들어 있다, want 1번", len(places))
	}
}

// 조회기는 식별자가 빈 가게를 일부러 살려 둔다. 중복 판정을 할 수 없기 때문이다.
// 지점이 다섯이 되면 이 함정을 밟을 기회도 다섯 배가 된다.
func TestSearchAroundKeepsPlacesWithEmptyID(t *testing.T) {
	var n int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		i := atomic.AddInt32(&n, 1)
		writeJSON(t, w, fmt.Sprintf(`{"documents":[
			{"id":"","place_name":"이름없는가게%d","category_name":"음식점 > 한식",
			 "phone":"","address_name":"","road_address_name":"길","place_url":"",
			 "x":"127.0276","y":"37.4979","distance":"10"}],"meta":{"is_end":true}}`, i))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	places, err := client.SearchAround(context.Background(), 37.4979, 127.0276, 500)
	if err != nil {
		t.Fatalf("SearchAround = %v", err)
	}
	if len(places) != 5 {
		t.Errorf("식별자가 빈 가게 %d곳이 남았다, want 5곳 — "+
			"빈 식별자로 중복 판정을 하면 멀쩡한 가게들이 서로를 지운다", len(places))
	}
}

// 중심은 필수다. 가까운 곳이 하나도 없는 결과는 이 서비스에 쓸모가 없다.
// isCenterRequest는 이 요청이 중심 지점을 물은 것인지 본다.
//
// **위도만 보면 안 된다.** 동쪽·서쪽 지점은 경도만 바뀌고 위도는 그대로라,
// 위도만 대조하면 그 둘도 중심으로 잡힌다. 조회기는 좌표를 
// strconv.FormatFloat(v, 'f', -1, 64)로 넣으므로 같은 방식으로 만들어 대조한다.
func isCenterRequest(r *http.Request, lat, lng float64) bool {
	return r.URL.Query().Get("x") == strconv.FormatFloat(lng, 'f', -1, 64) &&
		r.URL.Query().Get("y") == strconv.FormatFloat(lat, 'f', -1, 64)
}

func TestSearchAroundFailsWhenCenterFails(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isCenterRequest(r, userLat, userLng) {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		writeJSON(t, w, `{"documents":[],"meta":{"is_end":true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	if _, err := client.SearchAround(context.Background(), userLat, userLng, 500); err == nil {
		t.Error("중심이 실패했는데 오류가 아니다")
	}
}

// 둘레는 보강이다. 하나가 빠져도 남은 것들의 분포는 온전하다.
func TestSearchAroundSurvivesPerimeterFailure(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isCenterRequest(r, userLat, userLng) { // 중심만 성공
			writeJSON(t, w, `{"documents":[
				{"id":"center","place_name":"중심가게","category_name":"음식점 > 한식",
				 "phone":"","address_name":"","road_address_name":"길","place_url":"",
				 "x":"127.0276","y":"37.4979","distance":"10"}],"meta":{"is_end":true}}`)
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	places, err := client.SearchAround(context.Background(), userLat, userLng, 500)
	if err != nil {
		t.Fatalf("둘레가 전부 실패했다고 전체가 실패하면 안 된다: %v", err)
	}
	if len(places) != 1 {
		t.Errorf("중심 결과 %d곳, want 1곳", len(places))
	}
}

// 중심을 먼저 부르고 성공한 뒤에 둘레를 부른다.
// 다섯을 한꺼번에 쏘면, 429가 순간 호출 제한일 때 우리 요청이 스스로를 밀어낸다.
func TestSearchAroundCallsCenterBeforePerimeter(t *testing.T) {
	const userLat, userLng = 37.4979, 127.0276
	var mu sync.Mutex
	var order []string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		if isCenterRequest(r, userLat, userLng) {
			order = append(order, "center")
		} else {
			order = append(order, "perimeter")
		}
		mu.Unlock()
		writeJSON(t, w, `{"documents":[],"meta":{"is_end":true}}`)
	}))
	defer server.Close()

	client := NewClientWithBaseURL("key", server.URL, server.Client())
	if _, err := client.SearchAround(context.Background(), userLat, userLng, 500); err != nil {
		t.Fatalf("SearchAround = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(order) == 0 || order[0] != "center" {
		t.Errorf("호출 순서 = %v, 중심이 먼저여야 한다", order)
	}
}
```

시험 파일 맨 위 `import` 블록에 `"sync"`, `"sync/atomic"`, `"fmt"`, `"strconv"`가 없으면
더합니다. `writeJSON`이라는 도우미가 없으면 아래를 시험 파일에 함께 넣습니다.

```go
func writeJSON(t *testing.T, w http.ResponseWriter, body string) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if _, err := io.WriteString(w, body); err != nil {
		t.Errorf("가짜 서버가 응답을 쓰지 못했다: %v", err)
	}
}
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd api && go test ./internal/kakao/ -run SearchAround 2>&1 | head -10`
예상: 컴파일 실패. `client.SearchAround undefined`.

- [ ] **단계 3: 최소 구현을 쓴다**

`api/internal/kakao/client.go`에 아래를 더합니다. `SearchRestaurants`는 그대로 둡니다
(한 지점 조회는 `SearchAround`가 내부에서 씁니다).

`import`에 `"sync"`와 `"github.com/VeritasForge/random-choice/api/internal/geo"`를 더합니다.

```go
// perimeterOffsetM은 둘레 지점을 중심에서 얼마나 옮길지다.
//
// 400m인 근거: 2026-09-06 실측에서 네 지역(홍대입구·강남·판교·상계) 모두
// 중심이 실제로 보는 범위가 반경 100~160m였다. 400m 떨어진 지점의 원은
// 그것과 만날 수 없어 겹치는 가게가 0곳이었고, 45곳이 약 220곳이 됐다.
// 새로 나온 가게는 사용자 원위치에서 127~618m(중앙값 194~394m)에 있었다.
//
// 이 값이 사용자에게 가장 좋은 거리인지는 확인되지 않았다. 300m나 500m가
// 나을 수도 있다(설계 문서 14절).
const perimeterOffsetM = 400.0

// SearchAround는 사용자 위치와 그 둘레 네 지점을 조회해 합친다.
//
// 왜 한 지점으로 부족한가: 카카오는 한 조회에 가까운 45곳까지만 준다.
// 사람이 많은 곳에서는 그 45곳이 반경 100~160m 안에 다 들어가서, 반경을
// 넓혀도 목록이 같다. 그 상태에서 음식 종류를 잘게 나누면 카드 절반이
// 가게 한 곳짜리가 된다(실측 43%). 다섯 지점을 보면 6%로 떨어진다.
//
// 돌려주는 모든 Place.Distance는 카카오가 준 값이 아니라 사용자가 준
// lat,lng 기준으로 다시 계산한 값이다. 카카오의 거리는 조회 중심 기준이라
// 그대로 쓰면 412m가 24m로 표시된다.
func (c *Client) SearchAround(ctx context.Context, lat, lng float64, radius int) ([]Place, error) {
	// 중심을 먼저 부른다. 다섯을 한꺼번에 쏘면 우리 요청 하나가 카카오 호출을
	// 열다섯 개 동시에 내는데, 429가 순간 호출 제한이라면 사용자가 한 명뿐일 때도
	// 그중 몇 개가 튕긴다. 하필 중심이 튕기면 전체가 실패로 답해진다.
	center, err := c.SearchRestaurants(ctx, lat, lng, radius)
	if err != nil {
		return nil, err
	}

	type point struct{ lat, lng float64 }
	offsets := [4][2]float64{
		{perimeterOffsetM, 0},  // 북
		{0, perimeterOffsetM},  // 동
		{-perimeterOffsetM, 0}, // 남
		{0, -perimeterOffsetM}, // 서
	}
	points := make([]point, 0, len(offsets))
	for _, o := range offsets {
		pLat, pLng := geo.Offset(lat, lng, o[0], o[1])
		points = append(points, point{pLat, pLng})
	}

	// 둘레는 보강이다. 하나가 실패해도 그 지점만 버리고 계속한다 —
	// 각 지점이 독립적으로 완전하거나 통째로 없으므로, 하나가 빠져도
	// 남은 것들의 분포는 온전하다.
	results := make([][]Place, len(points))
	var wg sync.WaitGroup
	for i, p := range points {
		wg.Add(1)
		go func(i int, p point) {
			defer wg.Done()
			found, err := c.SearchRestaurants(ctx, p.lat, p.lng, radius)
			if err != nil {
				slog.Warn("둘레 지점 조회에 실패해 그 지점을 건너뜁니다",
					"error", err.Error())
				return
			}
			results[i] = found
		}(i, p)
	}
	wg.Wait()

	merged := make([]Place, 0, len(center)+len(points)*pageSize*maxPages)
	seen := make(map[string]struct{}, cap(merged))
	add := func(places []Place) {
		for _, p := range places {
			// 식별자가 빈 건은 중복 판정을 할 수 없다. 하나로 뭉뚱그리면
			// 멀쩡한 가게들이 사라지므로 그냥 그대로 살린다.
			if p.ID != "" {
				if _, duplicate := seen[p.ID]; duplicate {
					continue
				}
				seen[p.ID] = struct{}{}
			}
			p.Distance = int(geo.DistanceMeters(lat, lng, p.Lat, p.Lng) + 0.5)
			merged = append(merged, p)
		}
	}
	add(center)
	for _, r := range results {
		add(r)
	}

	sort.Slice(merged, func(i, j int) bool { return merged[i].Distance < merged[j].Distance })
	return merged, nil
}
```

`import`에 `"sort"`가 없으면 더합니다.

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd api && go test ./internal/kakao/ -v -run SearchAround 2>&1 | tail -25`
예상: 새 시험 일곱 개가 전부 PASS. 기존 시험도 함께 도는지 확인합니다:
`cd api && go test ./internal/kakao/`

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`add` 안의 `p.Distance = int(geo.DistanceMeters(...))` 줄을 잠시 지웁니다
(카카오가 준 거리를 그대로 쓰게 만듭니다).

실행: `cd api && go test ./internal/kakao/ -run RecomputesDistance -v`
예상: **FAIL** — "카카오가 준 거리를 그대로 쓰고 있다".

확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add api/internal/kakao/
git commit -m "feat(api): 다섯 지점을 함께 조회하고 거리를 사용자 기준으로 다시 계산

카카오는 한 조회에 가까운 45곳까지만 준다. 사람이 많은 곳에서는 그 45곳이
반경 100~160m 안에 다 들어가서 반경을 넓혀도 목록이 같았다. 중심을 400m
옮기면 실측 네 지역 모두 겹치는 가게가 0곳이었고 45곳이 약 220곳이 됐다.

카카오가 주는 거리는 조회 중심 기준이라 그대로 쓰면 412m가 24m로 표시된다.
사용자가 준 좌표 기준으로 전부 다시 계산한다. 그 계산을 빼면 시험이 실패하는
것을 확인했다.

중심을 먼저 부르고 성공한 뒤에 둘레 넷을 병렬로 부른다. 429가 순간 호출
제한이면 다섯을 한꺼번에 쏠 때 우리 요청이 스스로를 밀어낼 수 있다.
중심 실패는 전체 실패, 둘레 실패는 그 지점만 건너뛴다."
```

---

### 작업 4: 응답에 종류 식별자 싣기

**파일:**
- 고침: `api/internal/httpapi/handler.go`
- 시험: `api/internal/httpapi/handler_test.go`

**인터페이스:**
- 쓰는 것: `cuisine.ClassifyWithReason`, `cuisine.CountBy`(작업 1), `Client.SearchAround`(작업 3)
- 내놓는 것: HTTP 응답 형태
  ```json
  {
    "cuisines": [{ "id": "gogi", "label": "고기·구이", "count": 27 }],
    "places":   [{ "id": "...", "name": "...", "cuisineId": "gogi",
                   "distance": 240, "roadAddress": "...", "phone": "...",
                   "placeUrl": "...", "lat": 37.4, "lng": 127.0 }]
  }
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`api/internal/httpapi/handler_test.go`에는 `PlaceFinder`를 만족하는 가짜가 있습니다.
그 가짜의 `SearchRestaurants` 메서드 **이름을 `SearchAround`로 바꿉니다** (본문은 그대로).
이름을 안 바꾸면 인터페이스를 만족하지 않아 컴파일이 실패합니다. 가짜의 타입 이름은
파일에서 직접 확인하십시오 — 아래 예시의 `fakeFinder`와 다를 수 있습니다. 그리고 아래 시험을 덧붙입니다.

```go
// 응답이 종류 식별자와 표시 이름을 나눠 실어야 한다.
// 화면이 저장하는 것은 id이고 그리는 것은 label이다. 둘을 나누지 않으면
// 저장되는 값이 카카오 문자열이 되어 이용 정책에 걸린다.
func TestNearbyResponseCarriesCuisineIDAndLabel(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "고깃집", CategoryName: "음식점 > 한식 > 육류,고기",
			Lat: 37.4, Lng: 127.0, Distance: 100},
	}}
	rec := httptest.NewRecorder()
	NewHandler(finder).ServeHTTP(rec,
		httptest.NewRequest("GET", "/api/v1/nearby?lat=37.4&lng=127.0&radius=500", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("상태 = %d, want 200. 본문: %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Cuisines []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
			Count int    `json:"count"`
		} `json:"cuisines"`
		Places []struct {
			CuisineID string `json:"cuisineId"`
		} `json:"places"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("응답을 읽지 못했다: %v", err)
	}
	if len(got.Cuisines) != 1 || got.Cuisines[0].ID != "gogi" {
		t.Fatalf("cuisines = %+v, want id=gogi 하나", got.Cuisines)
	}
	if got.Cuisines[0].Label != "고기·구이" {
		t.Errorf("label = %q, want 고기·구이", got.Cuisines[0].Label)
	}
	if len(got.Places) != 1 || got.Places[0].CuisineID != "gogi" {
		t.Errorf("places[0].cuisineId = %+v, want gogi", got.Places)
	}
}

// 점심 대상이 아닌 가게는 응답에 없어야 한다.
func TestNearbyExcludesNonLunchPlaces(t *testing.T) {
	finder := &fakeFinder{places: []kakao.Place{
		{ID: "1", Name: "위스키바", CategoryName: "음식점 > 술집 > 칵테일바",
			Lat: 37.4, Lng: 127.0, Distance: 50},
		{ID: "2", Name: "밥집", CategoryName: "음식점 > 한식",
			Lat: 37.4, Lng: 127.0, Distance: 60},
	}}
	rec := httptest.NewRecorder()
	NewHandler(finder).ServeHTTP(rec,
		httptest.NewRequest("GET", "/api/v1/nearby?lat=37.4&lng=127.0&radius=500", nil))

	if strings.Contains(rec.Body.String(), "위스키바") {
		t.Error("술집이 결과에 들어 있다. 점심에 위스키바를 권하면 안 된다")
	}
	if !strings.Contains(rec.Body.String(), "밥집") {
		t.Error("점심 대상인 가게까지 빠졌다")
	}
}
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd api && go test ./internal/httpapi/ 2>&1 | head -15`
예상: 컴파일 실패 (`cuisine.Extract` 없음, `fakeFinder`가 인터페이스를 만족하지 않음).

- [ ] **단계 3: 최소 구현을 쓴다**

`api/internal/httpapi/handler.go`를 고칩니다.

```go
// PlaceFinder는 주변 음식점을 찾아 주는 무언가다.
// 실제로는 카카오 조회기가, 시험에서는 가짜가 들어간다.
type PlaceFinder interface {
	SearchAround(ctx context.Context, lat, lng float64, radius int) ([]kakao.Place, error)
}

type cuisineDTO struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type placeDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	CuisineID   string  `json:"cuisineId"`
	Distance    int     `json:"distance"`
	RoadAddress string  `json:"roadAddress"`
	Phone       string  `json:"phone"`
	PlaceURL    string  `json:"placeUrl"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
}
```

`buildResponse`를 아래로 바꿉니다.

```go
// buildResponse는 조회 결과를 응답 형태로 옮긴다.
//
// 버린 건수를 이유별로 나눠 세는 이유: "점심 대상 아님"은 실측에서 14%였고 거의 매
// 요청마다 생기는 의도된 동작이다. "맞는 규칙 없음"은 실측 664곳 중 3곳뿐이었지만
// 우리 어휘에 구멍이 있다는 신호다. 한 숫자로 합치면 경고가 늘 켜져 있게 되어
// 정작 중요한 신호가 그 안에 묻힌다.
func buildResponse(found []kakao.Place) nearbyResponse {
	places := make([]placeDTO, 0, len(found))
	cuisines := make([]cuisine.Cuisine, 0, len(found))
	notLunch, noRule := 0, 0

	for _, place := range found {
		c, ok, reason := cuisine.ClassifyWithReason(place.CategoryName)
		if !ok {
			switch reason {
			case cuisine.DropNotLunch:
				notLunch++
			case cuisine.DropNoRule:
				noRule++
			}
			continue
		}
		cuisines = append(cuisines, c)
		places = append(places, placeDTO{
			ID:          place.ID,
			Name:        place.Name,
			CuisineID:   c.ID,
			Distance:    place.Distance,
			RoadAddress: place.RoadAddress,
			Phone:       place.Phone,
			PlaceURL:    place.PlaceURL,
			Lat:         place.Lat,
			Lng:         place.Lng,
		})
	}

	switch {
	case len(found) == 0:
		// 카카오가 한 곳도 주지 않은 경우는 handleNearby가 반경과 함께 남긴다.
	case len(places) == 0:
		slog.Error("음식 종류를 하나도 뽑지 못했습니다",
			"notLunch", notLunch, "noRule", noRule, "total", len(found))
	case noRule > 0:
		// 이쪽이 진짜 신호다. 카카오가 분류 문자열 형식을 바꿨거나
		// 우리 어휘가 못 덮는 분류가 늘었다는 뜻이다.
		slog.Warn("맞는 규칙이 없어 뺀 가게가 있습니다",
			"noRule", noRule, "total", len(found))
	}

	tallies := cuisine.CountBy(cuisines)
	dtos := make([]cuisineDTO, 0, len(tallies))
	for _, t := range tallies {
		dtos = append(dtos, cuisineDTO{ID: t.Cuisine.ID, Label: t.Cuisine.Label, Count: t.Count})
	}
	return nearbyResponse{Cuisines: dtos, Places: places}
}
```

`handleNearby` 안에서 `finder.SearchRestaurants(...)`를 부르는 자리를
`finder.SearchAround(...)`로 바꿉니다. `cmd/server/main.go`도 함께 봅니다 —
`kakao.NewClient(...)`를 `PlaceFinder`에 넣는 자리는 그대로 통과합니다
(`*Client`가 새 메서드를 갖게 됐으므로).

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd api && go test ./... && go vet ./...`
예상: 전부 PASS.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`switch reason` 블록을 `notLunch++` 하나로 합칩니다(두 이유를 한 숫자로 만듭니다).
그 상태로 술집만 있는 응답을 만들어 로그를 봅니다 — `noRule` 경고가 나오지 않아야
정상인데, 합치면 구분이 사라집니다.

이 방어는 시험으로 잡기 어려우므로, **`noRule`이 응답 형태에 드러나지 않는다는 사실을
확인만 하고** 되돌립니다. 로그는 서버 쪽에만 남습니다.

- [ ] **단계 6: 커밋한다**

```bash
git add api/
git commit -m "feat(api): 응답에 종류 식별자와 표시 이름을 나눠 싣기

화면이 저장하는 것은 id이고 그리는 것은 label이다. 나누지 않으면 저장되는
값이 카카오 분류 문자열이 되어 이용 정책에 걸린다.

places[].cuisine을 cuisineId로, cuisines[].name을 id+label로 바꿨다.
조회는 SearchAround를 부르므로 다섯 지점 결과가 그대로 응답에 실린다.

버린 건수를 이유별로 나눠 로그에 남긴다. '점심 대상 아님'은 매번 생기는
의도된 동작이라, 합치면 '맞는 규칙 없음'이라는 드문 신호를 덮는다."
```

---

### 작업 5: 화면이 새 응답 형태를 읽기

**파일:**
- 고침: `web/lib/api.ts`, `web/app/page.tsx`
- 시험: `web/lib/api.test.ts`

**인터페이스:**
- 쓰는 것: 작업 4의 응답 형태
- 내놓는 것:
  ```ts
  export type Cuisine = { id: string; label: string; count: number };
  export type Place = {
    id: string; name: string; cuisineId: string; distance: number;
    roadAddress: string; phone: string; placeUrl: string;
    lat: number; lng: number;
  };
  export type NearbyResult = { cuisines: Cuisine[]; places: Place[] };
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/api.test.ts`에서 응답 자료를 만드는 자리를 새 형태로 바꾸고, 아래를 덧붙입니다.

```ts
// 원소 검사의 규칙은 하나다 — 타입이 약속하는 항목은 전부 확인한다.
// 한 항목씩만 어긋뜨려야 각 검사가 실제로 지켜진다. 여러 개를 동시에 빼면
// 먼저 걸리는 검사 하나가 나머지를 가려서, 검사를 지워도 시험이 통과한다.
describe("isCuisine과 isPlace가 새 항목을 확인한다", () => {
  const goodCuisine = { id: "gogi", label: "고기·구이", count: 3 };
  const goodPlace = {
    id: "p1", name: "고깃집", cuisineId: "gogi", distance: 100,
    roadAddress: "길 1", phone: "02-000-0000",
    placeUrl: "https://place.map.kakao.com/1", lat: 37.4, lng: 127.0,
  };

  it.each([
    ["id가 빠지면", { ...goodCuisine, id: undefined }],
    ["id가 빈 문자열이면", { ...goodCuisine, id: "" }],
    ["label이 빠지면", { ...goodCuisine, label: undefined }],
    ["label이 빈 문자열이면", { ...goodCuisine, label: "" }],
    ["count가 숫자가 아니면", { ...goodCuisine, count: "3" }],
  ])("음식 종류는 %s 거부한다", async (_name, broken) => {
    await expectMalformed({ cuisines: [broken], places: [goodPlace] });
  });

  it.each([
    ["cuisineId가 빠지면", { ...goodPlace, cuisineId: undefined }],
    ["cuisineId가 빈 문자열이면", { ...goodPlace, cuisineId: "" }],
    ["distance가 숫자가 아니면", { ...goodPlace, distance: "100" }],
    ["name이 빠지면", { ...goodPlace, name: undefined }],
  ])("가게는 %s 거부한다", async (_name, broken) => {
    await expectMalformed({ cuisines: [goodCuisine], places: [broken] });
  });

  it("온전한 자료는 받아들인다", async () => {
    const result = await fetchWith({ cuisines: [goodCuisine], places: [goodPlace] });
    expect(result.cuisines[0].id).toBe("gogi");
    expect(result.places[0].cuisineId).toBe("gogi");
  });
});
```

`expectMalformed`와 `fetchWith`는 이 파일에 이미 있는 가짜 `fetch` 패턴을 따라
만듭니다. 없으면 아래처럼 둡니다.

```ts
async function fetchWith(body: unknown) {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  return fetchNearby(37.4, 127.0, 500);
}

async function expectMalformed(body: unknown) {
  await expect(fetchWith(body)).rejects.toMatchObject({ code: "malformed_response" });
}
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd web && npx vitest run lib/api.test.ts 2>&1 | tail -20`
예상: FAIL.

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/api.ts`의 타입과 검사를 고칩니다.

```ts
export type Cuisine = { id: string; label: string; count: number };

export type Place = {
  id: string;
  name: string;
  cuisineId: string;
  distance: number;
  roadAddress: string;
  phone: string;
  placeUrl: string;
  lat: number;
  lng: number;
};
```

```ts
function isCuisine(value: unknown): value is Cuisine {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Cuisine;
  return (
    // id가 비면 후보 대조와 React key가 함께 무너진다.
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    // label이 비면 글자 없는 후보 버튼이 그려진다.
    typeof candidate.label === "string" &&
    candidate.label.length > 0 &&
    Number.isFinite(candidate.count)
  );
}
```

`isPlace`에서 `candidate.cuisine`을 `candidate.cuisineId`로 바꾸고, 빈 문자열도
거부하도록 둡니다(비면 결과 화면의 종류 필터에 아무것도 걸리지 않아 목록이 텅 빕니다).

`web/app/page.tsx`에서 아래 세 자리를 고칩니다.

```ts
// 1) 후보 이름 목록 → 종류 객체 목록. id로 유일성을 판정한다.
const cuisines = result.cuisines;

// 2) 종류를 고를 때 필터 기준
const pool = view.result.places.filter((place) => place.cuisineId === chosen.id);

// 3) React key
key={cuisine.id}
```

`View` 타입의 `candidates: string[]`을 `candidates: Cuisine[]`로,
`result` 갈래의 `cuisine: string`을 `cuisine: Cuisine`으로 바꿉니다.
`CandidateScreen`과 `ResultScreen`의 props도 함께 맞춥니다.

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd web && npm run build && npm test && npx tsc --noEmit && npm run lint`
예상: 전부 통과.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`isCuisine`에서 `candidate.label.length > 0` 조건을 지우고 시험을 돌립니다.

실행: `cd web && npx vitest run lib/api.test.ts -t "label이 빈 문자열이면"`
예상: **FAIL**. 확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add web/
git commit -m "feat(web): 응답의 종류 식별자와 표시 이름을 나눠 읽기

저장에 쓰는 id와 화면에 그리는 label을 나눴다. 항목 검사도 새 형태에 맞춰
넓혔다 — 타입이 약속하는 항목은 전부 확인한다는 기존 규칙 그대로다.

검사가 실제로 지켜지는지 확인하려고 온전한 자료를 기준으로 두고 한 항목씩만
어긋뜨렸다. 여러 개를 동시에 빼면 먼저 걸리는 검사가 나머지를 가린다."
```

---

### 작업 6: 가까운 여덟 곳 창 안에서 뽑기

**파일:**
- 고침: `web/lib/places.ts`
- 시험: `web/lib/places.test.ts`

**인터페이스:**
- 쓰는 것: `Place`(작업 5), `pickAvoiding`(기존)
- 내놓는 것:
  ```ts
  /** 한 번에 넓히는 창의 크기. */
  export const WINDOW_STEP = 8;
  export function pickPlaces(
    pool: readonly Place[], count: number, avoid: readonly Place[],
    rng: Rng, windowSize?: number,
  ): Place[];
  ```

**설계 근거(설계 문서 4-3절):** 지금 `pickPlaces`는 종류 안의 **모든** 가게에서 균등하게
뽑은 뒤 보기 좋으라고 정렬한다. 정렬은 뽑힐 확률에 아무 영향이 없다. 강남역 실측에서
`분식`은 5m 거리에 가게가 있는데도 지금 방식이면 326m를 권하게 된다.

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/places.test.ts` **끝에** 덧붙입니다.

```ts
function placeAt(id: string, distance: number): Place {
  return {
    id, name: `가게${id}`, cuisineId: "gogi", distance,
    roadAddress: "길", phone: "", placeUrl: "", lat: 37.4, lng: 127.0,
  };
}

// 20곳 중 앞의 8곳만 가깝고 나머지는 멀다.
const spread = [
  ...Array.from({ length: 8 }, (_, i) => placeAt(`near${i}`, 50 + i * 10)),
  ...Array.from({ length: 12 }, (_, i) => placeAt(`far${i}`, 400 + i * 20)),
];

describe("가까운 곳 창", () => {
  // 이 시험이 이 작업의 핵심이다. 없으면 5m 거리에 가게를 두고 326m를 권한다.
  it("표본이 넓어도 처음에는 가까운 여덟 곳 안에서만 뽑는다", () => {
    // 난수를 여러 번 다르게 주어도 먼 곳이 섞이지 않아야 한다.
    for (let seed = 0; seed < 20; seed += 1) {
      const rng = makeRng(seed);
      const picked = pickPlaces(spread, 4, [], rng);
      for (const place of picked) {
        expect(place.id.startsWith("near")).toBe(true);
      }
    }
  });

  it("창을 넓히면 먼 곳도 나온다", () => {
    const wide = pickPlaces(spread, 4, [], makeRng(1), spread.length);
    // 창이 전체면 먼 곳이 섞일 수 있다. 적어도 뽑을 후보가 전체가 되었는지 본다.
    const anyFar = Array.from({ length: 30 }, (_, s) =>
      pickPlaces(spread, 4, [], makeRng(s), spread.length),
    ).flat();
    expect(anyFar.some((p) => p.id.startsWith("far"))).toBe(true);
    expect(wide).toHaveLength(4);
  });

  it("가게가 창보다 적으면 전체에서 뽑는다", () => {
    const few = spread.slice(0, 3);
    const picked = pickPlaces(few, 4, [], makeRng(0));
    expect(picked).toHaveLength(3);
  });

  it("돌려주는 목록은 가까운 순이다", () => {
    const picked = pickPlaces(spread, 4, [], makeRng(0));
    const distances = picked.map((p) => p.distance);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("원본 목록의 순서를 건드리지 않는다", () => {
    const original = [...spread];
    pickPlaces(spread, 4, [], makeRng(0));
    expect(spread).toEqual(original);
  });
});
```

`makeRng`가 이 파일에 없으면 아래를 넣습니다.

```ts
/** 시험용 난수. 같은 씨앗이면 언제나 같은 수열을 준다. */
function makeRng(seed: number): Rng {
  let state = seed + 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd web && npx vitest run lib/places.test.ts 2>&1 | tail -20`
예상: "표본이 넓어도 처음에는 가까운 여덟 곳 안에서만 뽑는다"가 FAIL.

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/places.ts`를 아래로 바꿉니다.

```ts
import type { Place } from "./api";
import { pickAvoiding, type Rng } from "./pick";

/**
 * 한 번에 넓히는 창의 크기.
 *
 * 여덟이라는 수에 근거는 없다. 강남역 실측(2026-09-06)에서 이 크기면 `분식`이
 * 326m 대신 74m를, `중식`이 439m 대신 295m를 권하게 되는 것을 확인했을 뿐이다.
 */
export const WINDOW_STEP = 8;

/**
 * 종류가 정해진 가게 목록에서 보여줄 만큼만 무작위로 고르고, 가까운 순으로 되돌린다.
 *
 * **가까운 순 창 안에서만 뽑는 이유가 이 함수의 핵심이다.**
 * 예전에는 종류 안의 모든 가게에서 균등하게 뽑고 나서 보기 좋으라고 정렬했다.
 * 그 정렬은 뽑힐 확률에 아무 영향이 없어서, 조회 지점을 다섯으로 늘리자
 * 먼 가게가 그만큼 자주 나오게 됐다 — 강남역 실측에서 `분식`은 5m 거리에
 * 가게가 있는데도 326m를 권하게 되는 상태였다.
 *
 * windowSize를 넘기면 그만큼 넓혀서 뽑는다. `다른 가게 보기`가 이 값을
 * WINDOW_STEP씩 키워 부른다. 창이 목록보다 크면 전체에서 뽑는 것과 같다.
 *
 * 무작위로 고르는 이유: 걸러진 것을 전부 보여주면 같은 자리에서 같은 종류를 고른
 * 사람에게 언제나 똑같은 화면이 나온다. 그러면 "다른 가게 보기"를 둘 자리가 없다.
 *
 * avoid에는 직전에 보여준 가게를 그대로 넘긴다. pickAvoiding이 항목을 참조로 견주므로,
 * pool은 부를 때마다 다시 걸러 만들지 말고 처음 만든 배열을 계속 써야 한다 —
 * 새로 filter해서 넘기면 같은 가게라도 다른 객체가 되어 겹침 판정이 통째로 무력해진다.
 * 식별자로 견주지 않는 것은 조회기가 식별자가 빈 가게를 일부러 살려 두기 때문이다
 * (api/internal/kakao/client.go). 그런 가게끼리는 서로 같다고 잘못 판정된다.
 *
 * 정렬에 toSorted가 아니라 sort를 쓰는 이유: Next.js가 "지원한다"고 선언한 하한이
 * Firefox 111인데(node_modules/next/dist/shared/lib/modern-browserslist-target.js)
 * Array.prototype.toSorted는 Firefox 115부터 있고, Next는 이 메서드를 폴리필하지 않는다.
 * 그 사이 판에서는 종류를 고르는 순간 TypeError가 나서 앱 전체가 오류 화면으로 넘어간다.
 * 아래에서 slice로 새 배열을 만든 뒤 정렬하므로 원본은 건드리지 않는다 —
 * 그 계약은 시험("원본 목록의 순서를 건드리지 않는다")이 지킨다.
 */
export function pickPlaces(
  pool: readonly Place[],
  count: number,
  avoid: readonly Place[],
  rng: Rng,
  windowSize: number = WINDOW_STEP,
): Place[] {
  const nearest = pool
    .slice()
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.max(windowSize, count));
  return pickAvoiding(nearest, count, avoid, rng).sort(
    (left, right) => left.distance - right.distance,
  );
}
```

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd web && npx vitest run lib/places.test.ts 2>&1 | tail -20`
예상: 전부 PASS.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`.slice(0, Math.max(windowSize, count))` 줄을 지웁니다(창을 없앱니다).

실행: `cd web && npx vitest run lib/places.test.ts -t "가까운 여덟 곳"`
예상: **FAIL**. 확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add web/lib/places.ts web/lib/places.test.ts
git commit -m "fix(web): 가게를 가까운 여덟 곳 창 안에서 뽑도록 수정

정렬이 거리 불만을 막는다고 여겼으나, pickPlaces는 균등 추첨을 끝낸 뒤
보기 좋으라고 정렬할 뿐이라 뽑힐 확률에는 아무 영향이 없었다. 조회 지점을
다섯으로 늘리면 먼 가게가 그만큼 자주 나온다.

강남역 실측에서 분식은 5m 거리에 가게가 있는데도 326m를 권하게 되는
상태였다. 창을 여덟 곳으로 두면 74m가 된다. '다른 가게 보기'가 창을
여덟 곳씩 넓힌다. 창을 없애면 시험이 실패하는 것을 확인했다."
```

---

### 작업 7: 정한 가게의 기록

**파일:**
- 만듦: `web/lib/visits.ts`, `web/lib/visits.test.ts`

**인터페이스:**
- 쓰는 것: 없음
- 내놓는 것:
  ```ts
  export type Visit = { placeId: string; placeName: string; at: string };
  /** 브라우저 저장소가 갖춰야 하는 최소한의 모양. 시험에서는 가짜를 넘긴다. */
  export type Store = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  export const STORAGE_KEY = "random-choice.visits.v1";
  export const RETENTION_DAYS = 14;
  export function readVisits(store: Store | null, now?: Date): Visit[];
  export function recordVisit(store: Store | null, placeId: string, placeName: string, now?: Date): void;
  export function forgetVisit(store: Store | null, placeId: string): void;
  export function forgetAll(store: Store | null): void;
  /** 브라우저에서 부를 때 넘길 저장소. 접근 자체가 예외를 던지면 null이다. */
  export function browserStore(): Store | null;
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/visits.test.ts`를 만듭니다.

```ts
import { describe, expect, it } from "vitest";
import {
  browserStore, forgetAll, forgetVisit, readVisits, recordVisit,
  RETENTION_DAYS, STORAGE_KEY, type Store,
} from "./visits";

/** 시험용 저장소. 실제 localStorage 대신 넘긴다. */
function fakeStore(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

/** 읽기와 쓰기 모두에서 예외를 던지는 저장소. 시크릿 창과 저장소 차단 설정을 흉내 낸다. */
function throwingStore(): Store {
  return {
    getItem: () => { throw new DOMException("접근이 거부되었습니다", "SecurityError"); },
    setItem: () => { throw new DOMException("용량을 초과했습니다", "QuotaExceededError"); },
    removeItem: () => { throw new DOMException("접근이 거부되었습니다", "SecurityError"); },
  };
}

const NOW = new Date("2026-09-06T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("기록 저장과 조회", () => {
  it("정한 가게를 기록하고 다시 읽는다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "연돈", NOW);
    const visits = readVisits(store, NOW);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ placeId: "p1", placeName: "연돈" });
  });

  it("같은 가게를 다시 정하면 날짜만 새로 쓴다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "연돈", daysAgo(5));
    recordVisit(store, "p1", "연돈", NOW);
    const visits = readVisits(store, NOW);
    expect(visits).toHaveLength(1);
    expect(visits[0].at).toBe(NOW.toISOString());
  });

  // 장소 ID가 빈 가게를 기록하면, 그 뒤 회피 기간 내내 ID가 빈 모든 가게가
  // 함께 사라진다. 카카오는 ID가 빈 응답도 주고 조회기는 그런 가게를 살려 둔다.
  it("장소 ID가 비면 기록하지 않는다", () => {
    const store = fakeStore();
    recordVisit(store, "", "이름없는가게", NOW);
    expect(readVisits(store, NOW)).toHaveLength(0);
  });

  it("보관 기간이 지난 기록은 읽을 때 사라진다", () => {
    const store = fakeStore();
    recordVisit(store, "old", "옛가게", daysAgo(RETENTION_DAYS + 1));
    recordVisit(store, "new", "새가게", daysAgo(1));
    const visits = readVisits(store, NOW);
    expect(visits.map((v) => v.placeId)).toEqual(["new"]);
  });

  it("한 줄씩 지운다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "가게1", NOW);
    recordVisit(store, "p2", "가게2", NOW);
    forgetVisit(store, "p1");
    expect(readVisits(store, NOW).map((v) => v.placeId)).toEqual(["p2"]);
  });

  it("전부 지운다", () => {
    const store = fakeStore();
    recordVisit(store, "p1", "가게1", NOW);
    forgetAll(store);
    expect(readVisits(store, NOW)).toHaveLength(0);
  });
});

describe("저장소가 말을 듣지 않을 때", () => {
  // 시크릿 창이나 저장소 차단 설정에서는 접근 자체가 예외를 던진다.
  // 그래도 서비스는 "기억 없는 상태"로 정상 동작해야 한다.
  it("읽기가 예외를 던져도 빈 목록을 돌려준다", () => {
    expect(readVisits(throwingStore(), NOW)).toEqual([]);
  });

  it("쓰기가 예외를 던져도 터지지 않는다", () => {
    expect(() => recordVisit(throwingStore(), "p1", "가게", NOW)).not.toThrow();
  });

  it("저장소가 없어도(null) 정상 동작한다", () => {
    expect(readVisits(null, NOW)).toEqual([]);
    expect(() => recordVisit(null, "p1", "가게", NOW)).not.toThrow();
    expect(() => forgetAll(null)).not.toThrow();
  });
});

describe("저장된 값이 망가졌을 때", () => {
  // 항목별로 검사해서 이상한 것만 버린다. 전부 버리면 사용자 기록이 통째로 사라진다.
  it("망가진 항목만 버리고 나머지는 살린다", () => {
    const store = fakeStore({
      [STORAGE_KEY]: JSON.stringify([
        { placeId: "good", placeName: "멀쩡한가게", at: NOW.toISOString() },
        { placeId: 123, placeName: "숫자아이디", at: NOW.toISOString() },
        { placeName: "아이디없음", at: NOW.toISOString() },
        { placeId: "nodate", placeName: "날짜없음" },
        { placeId: "baddate", placeName: "날짜이상", at: "어제" },
        "문자열",
        null,
      ]),
    });
    const visits = readVisits(store, NOW);
    expect(visits.map((v) => v.placeId)).toEqual(["good"]);
  });

  it("JSON이 아니면 빈 목록을 돌려준다", () => {
    const store = fakeStore({ [STORAGE_KEY]: "{{{" });
    expect(readVisits(store, NOW)).toEqual([]);
  });

  it("배열이 아니면 빈 목록을 돌려준다", () => {
    const store = fakeStore({ [STORAGE_KEY]: JSON.stringify({ placeId: "p1" }) });
    expect(readVisits(store, NOW)).toEqual([]);
  });
});

describe("브라우저 저장소 얻기", () => {
  it("localStorage가 없는 환경에서는 null을 돌려준다", () => {
    // 시험은 node 환경에서 돈다. localStorage가 없다.
    expect(browserStore()).toBeNull();
  });
});
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd web && npx vitest run lib/visits.test.ts 2>&1 | head -15`
예상: `Cannot find module './visits'`.

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/visits.ts`를 만듭니다.

```ts
/**
 * 사용자가 "여기로 정했어요"를 누른 가게의 기록.
 *
 * **무엇을 저장하는가가 이 파일의 전부다.** 카카오는 응답 결과의 저장을 금지하지만,
 * 사용자가 직접 찜하거나 담은 장소의 장소ID·상호는 저장을 명시적으로 허용했다
 * (설계 문서 9절에 담당자 답변 원문이 있다). 그래서 여기 담기는 것은 셋뿐이다.
 *
 * **음식 종류는 넣지 않는다.** 종류 식별자는 카카오 분류 문자열을 입력으로 계산해 낸
 * 값이라 "응답에 기반한 가공 데이터"로 읽힐 여지가 있고, 종류 회피 자체가 효과의
 * 근거 없이 사용자를 교정하는 개입이라 이번 범위에서 뺐다. 나중에 편의로 한 줄
 * 더하고 싶어지면 그 두 이유를 먼저 다시 읽어야 한다.
 */

export type Visit = {
  placeId: string;
  placeName: string;
  /** ISO 8601 문자열. 우리가 만든 값이다. */
  at: string;
};

/**
 * 브라우저 저장소가 갖춰야 하는 최소한의 모양.
 *
 * localStorage를 직접 부르지 않고 인자로 받는 이유: 화면 시험이 브라우저 없이
 * node에서 돌기 때문이다. 추첨 함수들이 난수 생성기를 인자로 받는 것과 같은 이유다.
 */
export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const STORAGE_KEY = "random-choice.visits.v1";

/**
 * 기록을 보관하는 날짜 수.
 *
 * 회피 기간과 같은 값으로 둔다. 다르게 두면 기록 화면에 "정한 곳"으로 보이는데
 * 정작 회피에는 안 쓰이는 항목이 섞여, 사용자가 "목록에 있는데 왜 또 나오지?"
 * 하게 된다. 같으면 기록 화면이 곧 "지금 빼고 있는 것"의 목록이 된다.
 *
 * 14일이라는 수에 근거는 없다. "2주에 한 번은 같은 집에 가도 된다"는 감각일 뿐이고,
 * 지금 구조에는 계측이 없어서 이 값을 고칠 자료도 모이지 않는다(설계 문서 14절).
 */
export const RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 브라우저에서 부를 때 넘길 저장소. 접근 자체가 예외를 던지면 null이다. */
export function browserStore(): Store | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    // 접근만으로 예외를 던지는 설정이 있으므로 한 번 만져 본다.
    localStorage.getItem(STORAGE_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

function isVisit(value: unknown): value is Visit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Visit;
  return (
    typeof v.placeId === "string" &&
    v.placeId.length > 0 &&
    typeof v.placeName === "string" &&
    typeof v.at === "string" &&
    Number.isFinite(Date.parse(v.at))
  );
}

function load(store: Store | null): Visit[] {
  if (store === null) {
    return [];
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // 항목별로 거른다. 하나가 망가졌다고 전부 버리면 사용자 기록이 통째로 사라진다.
    return parsed.filter(isVisit);
  } catch {
    return [];
  }
}

function save(store: Store | null, visits: Visit[]): void {
  if (store === null) {
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch {
    // 용량이 찼거나 저장이 막혔다. 사용자가 할 수 있는 일이 없으므로 조용히 포기한다.
    // 기억 없는 상태로 계속 동작하는 것이 오류 화면을 띄우는 것보다 낫다.
  }
}

/** 보관 기간 안에 있는 기록만 돌려준다. 최근에 정한 것이 앞에 온다. */
export function readVisits(store: Store | null, now: Date = new Date()): Visit[] {
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  return load(store)
    .filter((v) => Date.parse(v.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * 사용자가 정한 가게를 기록한다.
 *
 * 장소 ID가 비면 아무것도 하지 않는다. 카카오는 ID가 빈 응답도 주는데,
 * 빈 문자열을 열쇠로 쓰면 그 뒤 회피 기간 내내 ID가 빈 모든 가게가 함께 사라진다.
 * 화면은 그런 가게에 "여기로 정했어요" 버튼을 아예 그리지 않는다.
 */
export function recordVisit(
  store: Store | null,
  placeId: string,
  placeName: string,
  now: Date = new Date(),
): void {
  if (placeId === "") {
    return;
  }
  const kept = load(store).filter((v) => v.placeId !== placeId);
  save(store, [...kept, { placeId, placeName, at: now.toISOString() }]);
}

export function forgetVisit(store: Store | null, placeId: string): void {
  save(store, load(store).filter((v) => v.placeId !== placeId));
}

export function forgetAll(store: Store | null): void {
  if (store === null) {
    return;
  }
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 지우지 못했다. 사용자가 할 수 있는 일이 없다.
  }
}
```

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd web && npx vitest run lib/visits.test.ts 2>&1 | tail -20`
예상: 전부 PASS.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`load`의 `.filter(isVisit)`를 `as Visit[]`로 바꿉니다(항목 검사를 없앱니다).

실행: `cd web && npx vitest run lib/visits.test.ts -t "망가진 항목만"`
예상: **FAIL**. 확인한 뒤 되돌립니다.

이어서 `recordVisit`의 `if (placeId === "") return;`을 지웁니다.

실행: `cd web && npx vitest run lib/visits.test.ts -t "장소 ID가 비면"`
예상: **FAIL**. 확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add web/lib/visits.ts web/lib/visits.test.ts
git commit -m "feat(web): 사용자가 정한 가게를 브라우저에 기록

카카오는 응답 결과의 저장을 금지하지만, 사용자가 직접 담은 장소의 장소ID와
상호는 저장을 명시적으로 허용했다. 그래서 담기는 것은 장소ID·상호·날짜
셋뿐이고 음식 종류는 넣지 않는다.

저장소를 인자로 받는다. 화면 시험이 브라우저 없이 node에서 돌기 때문이다.
읽기와 쓰기를 전부 try/catch로 감싸, 시크릿 창처럼 접근 자체가 예외를 던지는
환경에서도 '기억 없는 상태'로 정상 동작한다.

항목별로 검사해 망가진 것만 버린다. 전부 버리면 사용자 기록이 통째로
사라진다. 장소 ID가 빈 가게는 기록하지 않는다 — 빈 문자열이 열쇠가 되면
ID 없는 모든 가게가 함께 사라진다. 두 방어 모두 꺼서 시험이 실패하는 것을
확인했다."
```

---

### 작업 8: 회피 규칙

**파일:**
- 만듦: `web/lib/avoid.ts`, `web/lib/avoid.test.ts`

**인터페이스:**
- 쓰는 것: `Place`(작업 5), `Visit`(작업 7)
- 내놓는 것:
  ```ts
  export type AvoidResult = {
    /** 회피를 적용한 뒤 남은 가게. */
    places: Place[];
    /** 실제로 뺀 가게 수. 0이면 화면은 안내 줄을 그리지 않는다. */
    removed: number;
    /** 전부 빠져서 이번만 회피를 풀었으면 true. */
    released: boolean;
  };
  export function avoidVisited(
    places: readonly Place[], visits: readonly Visit[], enabled: boolean,
  ): AvoidResult;
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/avoid.test.ts`를 만듭니다.

```ts
import { describe, expect, it } from "vitest";
import { avoidVisited } from "./avoid";
import type { Place } from "./api";
import type { Visit } from "./visits";

function place(id: string): Place {
  return {
    id, name: `가게${id}`, cuisineId: "gogi", distance: 100,
    roadAddress: "길", phone: "", placeUrl: "", lat: 37.4, lng: 127.0,
  };
}
const visit = (placeId: string): Visit => ({ placeId, placeName: `가게${placeId}`, at: "2026-09-05T12:00:00Z" });

describe("정한 곳 회피", () => {
  it("기록에 있는 가게를 뺀다", () => {
    const got = avoidVisited([place("a"), place("b")], [visit("a")], true);
    expect(got.places.map((p) => p.id)).toEqual(["b"]);
    expect(got.removed).toBe(1);
    expect(got.released).toBe(false);
  });

  it("꺼져 있으면 아무것도 빼지 않는다", () => {
    const got = avoidVisited([place("a"), place("b")], [visit("a")], false);
    expect(got.places).toHaveLength(2);
    expect(got.removed).toBe(0);
  });

  it("기록이 비어 있으면 뺀 것이 0이다", () => {
    const got = avoidVisited([place("a")], [], true);
    expect(got.removed).toBe(0);
    expect(got.places).toHaveLength(1);
  });

  // 전부 빠지면 빈 화면이 된다. 이번만 풀되 풀었다는 사실을 화면이 알아야 알릴 수 있다.
  it("전부 빠지면 이번만 풀고 그 사실을 함께 돌려준다", () => {
    const got = avoidVisited([place("a"), place("b")], [visit("a"), visit("b")], true);
    expect(got.places).toHaveLength(2);
    expect(got.released).toBe(true);
    expect(got.removed).toBe(0);
  });

  it("빈 목록을 넣으면 빈 목록이 나온다", () => {
    const got = avoidVisited([], [visit("a")], true);
    expect(got.places).toEqual([]);
    expect(got.released).toBe(false);
  });

  // 조회기가 식별자 빈 가게를 살려 두므로, 빈 문자열끼리 같다고 판정하면 안 된다.
  it("장소 ID가 빈 가게는 서로를 지우지 않는다", () => {
    const nameless = [place(""), place("")];
    const got = avoidVisited(nameless, [{ placeId: "", placeName: "", at: "2026-09-05T12:00:00Z" }], true);
    expect(got.places).toHaveLength(2);
    expect(got.removed).toBe(0);
  });

  it("원본 목록을 건드리지 않는다", () => {
    const places = [place("a"), place("b")];
    const copy = [...places];
    avoidVisited(places, [visit("a")], true);
    expect(places).toEqual(copy);
  });
});
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd web && npx vitest run lib/avoid.test.ts 2>&1 | head -10`
예상: `Cannot find module './avoid'`.

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/avoid.ts`를 만듭니다.

```ts
import type { Place } from "./api";
import type { Visit } from "./visits";

export type AvoidResult = {
  /** 회피를 적용한 뒤 남은 가게. */
  places: Place[];
  /** 실제로 뺀 가게 수. 0이면 화면은 안내 줄을 그리지 않는다. */
  removed: number;
  /** 전부 빠져서 이번만 회피를 풀었으면 true. */
  released: boolean;
};

/**
 * 사용자가 최근에 "여기로 정했어요"를 누른 가게를 결과에서 뺀다.
 *
 * **몇 곳을 뺐는지 함께 돌려주는 이유**: 조용히 거르면 통제권이 없는 것과 같다.
 * 무엇을 했는지 말해 주고 되돌릴 수 있게 하는 것이 이 설계의 뼈대다.
 *
 * **전부 빠지면 이번만 푸는 이유**: 회피 때문에 빈 화면을 주면, 사용자는 주변에
 * 가게가 없다고 오해한다. 있는데 우리가 감춘 것이므로 보여 주고 그 사실을 알린다.
 *
 * 장소 ID가 빈 가게는 대조에서 제외한다. 카카오는 ID가 빈 응답도 주고 조회기는
 * 그런 가게를 일부러 살려 두는데, 빈 문자열끼리 같다고 판정하면 서로를 지운다.
 */
export function avoidVisited(
  places: readonly Place[],
  visits: readonly Visit[],
  enabled: boolean,
): AvoidResult {
  if (!enabled || places.length === 0) {
    return { places: [...places], removed: 0, released: false };
  }

  const visited = new Set(visits.map((v) => v.placeId).filter((id) => id !== ""));
  const kept = places.filter((p) => p.id === "" || !visited.has(p.id));

  if (kept.length === 0) {
    return { places: [...places], removed: 0, released: true };
  }
  return { places: kept, removed: places.length - kept.length, released: false };
}
```

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd web && npx vitest run lib/avoid.test.ts 2>&1 | tail -15`
예상: 전부 PASS.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`if (kept.length === 0)` 블록을 지웁니다.

실행: `cd web && npx vitest run lib/avoid.test.ts -t "전부 빠지면"`
예상: **FAIL**. 확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add web/lib/avoid.ts web/lib/avoid.test.ts
git commit -m "feat(web): 최근에 정한 가게를 결과에서 빼는 규칙

몇 곳을 뺐는지 함께 돌려준다. 조용히 거르면 통제권이 없는 것과 같다.
전부 빠지면 이번만 풀고 그 사실도 함께 돌려준다 — 회피 때문에 빈 화면을
주면 사용자는 주변에 가게가 없다고 오해한다.

장소 ID가 빈 가게는 대조에서 제외한다. 빈 문자열끼리 같다고 판정하면
멀쩡한 가게들이 서로를 지운다."
```

---

### 작업 9: 이유 한 줄 만들기

**파일:**
- 만듦: `web/lib/reasons.ts`, `web/lib/reasons.test.ts`

**인터페이스:**
- 쓰는 것: 없음(순수 함수)
- 내놓는 것:
  ```ts
  export const WALK_METERS_PER_MINUTE = 67;
  /** "240m · 도보 4분" 같은 문구. */
  export function distanceLabel(meters: number): string;
  /** 후보 카드에 붙일 문구. "주변 12곳". */
  export function countLabel(count: number): string;
  /** 결과 화면 맨 위 안내. 뺀 것이 없으면 null. */
  export function avoidNotice(removed: number, released: boolean): string | null;
  ```

- [ ] **단계 1: 실패하는 시험을 쓴다**

`web/lib/reasons.test.ts`를 만듭니다.

```ts
import { describe, expect, it } from "vitest";
import { avoidNotice, countLabel, distanceLabel } from "./reasons";

describe("거리 문구", () => {
  it("미터와 도보 시간을 함께 보여 준다", () => {
    expect(distanceLabel(240)).toBe("240m · 도보 4분");
  });

  it("아주 가까우면 1분으로 올린다", () => {
    // 0분이라고 쓰면 무슨 뜻인지 알 수 없다.
    expect(distanceLabel(10)).toBe("10m · 도보 1분");
  });

  it("올림한다 — 실제보다 짧게 말하지 않는다", () => {
    // 68m는 1.01분이다. 넉넉히 잡는 쪽이 사용자를 덜 실망시킨다.
    expect(distanceLabel(68)).toBe("68m · 도보 2분");
  });

  it("먼 곳도 정직하게 보여 준다", () => {
    // 실측에서 제주 애월의 가장 먼 가게가 867m였다. 감추지 않는다.
    expect(distanceLabel(867)).toBe("867m · 도보 13분");
  });
});

describe("곳 수 문구", () => {
  it("주변 몇 곳인지 알린다", () => {
    expect(countLabel(12)).toBe("주변 12곳");
  });
  it("한 곳뿐이어도 그대로 말한다", () => {
    expect(countLabel(1)).toBe("주변 1곳");
  });
});

describe("회피 안내", () => {
  // 항상 참인 문구는 붙이지 않는다. 기록이 빈 첫 사용자는 지금과 똑같은 화면을 본다.
  it("뺀 것이 없으면 안내를 만들지 않는다", () => {
    expect(avoidNotice(0, false)).toBeNull();
  });

  it("뺀 것이 있으면 몇 곳인지 말한다", () => {
    expect(avoidNotice(2, false)).toBe("지난번에 정하신 곳 2곳은 빼고 골랐어요");
  });

  it("전부 빠져서 풀었으면 그 사실을 말한다", () => {
    expect(avoidNotice(0, true)).toBe(
      "여기 있는 곳은 모두 최근에 정하신 곳이라 이번엔 그대로 보여 드려요",
    );
  });
});
```

- [ ] **단계 2: 시험이 실패하는지 확인한다**

실행: `cd web && npx vitest run lib/reasons.test.ts 2>&1 | head -10`
예상: `Cannot find module './reasons'`.

- [ ] **단계 3: 최소 구현을 쓴다**

`web/lib/reasons.ts`를 만듭니다.

```ts
/**
 * 화면에 붙일 짧은 이유 문구를 만든다.
 *
 * 이유를 붙이는 근거: 추천 이유를 설명하면 수용도가 오른다는 것이 여러 연구가
 * 같은 방향으로 가리키는 결과다. 다만 그것은 **정보가 담긴 이유**에 관한 것이고,
 * 늘 참인 딱지에는 적용되지 않는다. 그래서 뺀 것이 없으면 안내를 만들지 않는다.
 */

/**
 * 도보 1분에 걷는 거리(m).
 *
 * 시속 4km를 분으로 나눈 값이다. 한국 부동산 광고는 보통 이보다 빠른 기준
 * (분당 80~100m)을 쓰지만, 그 법정 기준을 확인하지 못했고 광고 기준은 짧게
 * 보이도록 만들어졌을 수 있다. **넉넉히 잡는 쪽을 골랐다** — "5분"이라고 하고
 * 4분이 걸리는 편이 그 반대보다 낫다.
 */
export const WALK_METERS_PER_MINUTE = 67;

/** "240m · 도보 4분" 같은 문구. 도보 시간은 올림하고 최소 1분이다. */
export function distanceLabel(meters: number): string {
  const minutes = Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));
  return `${meters}m · 도보 ${minutes}분`;
}

/**
 * 후보 카드에 붙일 문구.
 *
 * 한 곳뿐이어도 그대로 말한다. 음식점이 드문 곳에서는 실제로 그런 카드가 생기고
 * (제주 애월 실측에서 카드 6장 중 3장), 감추면 "다른 가게 보기"를 눌렀을 때
 * 아무 일도 일어나지 않는 이유를 사용자가 알 수 없다.
 */
export function countLabel(count: number): string {
  return `주변 ${count}곳`;
}

/**
 * 결과 화면 맨 위 안내. 뺀 것이 없으면 null을 돌려주고, 화면은 줄 자체를 그리지 않는다.
 *
 * released는 회피 때문에 가게가 하나도 안 남아 이번만 푼 경우다.
 * 그때 아무 말도 하지 않으면 사용자는 회피가 동작하지 않는다고 여긴다.
 */
export function avoidNotice(removed: number, released: boolean): string | null {
  if (released) {
    return "여기 있는 곳은 모두 최근에 정하신 곳이라 이번엔 그대로 보여 드려요";
  }
  if (removed <= 0) {
    return null;
  }
  return `지난번에 정하신 곳 ${removed}곳은 빼고 골랐어요`;
}
```

- [ ] **단계 4: 시험이 통과하는지 확인한다**

실행: `cd web && npx vitest run lib/reasons.test.ts 2>&1 | tail -15`
예상: 전부 PASS.

- [ ] **단계 5: 방어가 실제로 지켜지는지 확인한다**

`avoidNotice`의 `if (removed <= 0) return null;`을 지웁니다.

실행: `cd web && npx vitest run lib/reasons.test.ts -t "뺀 것이 없으면"`
예상: **FAIL**. 확인한 뒤 되돌립니다.

- [ ] **단계 6: 커밋한다**

```bash
git add web/lib/reasons.ts web/lib/reasons.test.ts
git commit -m "feat(web): 거리·곳 수·회피 안내 문구 만들기

도보 시간은 분당 67m(시속 4km)로 환산하고 올림한다. 한국 부동산 광고 기준은
이보다 빠르지만 그 법정 기준을 확인하지 못했고, 광고 기준은 짧게 보이도록
만들어졌을 수 있어 넉넉히 잡는 쪽을 골랐다.

뺀 것이 없으면 안내를 만들지 않는다. 항상 참인 문구는 정보가 아니라 잡음이고,
기록이 빈 첫 사용자는 지금과 똑같은 화면을 봐야 한다."
```

---

### 작업 10: 화면 조립

**파일:**
- 고침: `web/app/page.tsx`, `web/components/ResultScreen.tsx`,
  `web/components/CandidateScreen.tsx`, `web/components/StartScreen.tsx`,
  `web/components/Notice.tsx`
- 만듦: `web/components/VisitsScreen.tsx`

**인터페이스:**
- 쓰는 것: 작업 5~9의 모든 것

- [ ] **단계 1: 화면 상태에 기록과 회피를 더한다**

`web/app/page.tsx`의 `View` 합집합에 기록 화면을 더합니다.

```ts
type View =
  | { kind: "start" }
  | { kind: "loading" }
  | { kind: "candidates"; result: NearbyResult; candidates: Cuisine[] }
  | {
      kind: "result";
      cuisine: Cuisine;
      /**
       * 고른 종류의 가게 **전부**. 회피를 적용하기 **전**의 목록이다.
       * 회피를 껐을 때 빠졌던 가게를 되돌리려면 이것이 있어야 한다 —
       * 걸러진 pool만 들고 있으면 스위치를 꺼도 가게가 돌아오지 않는다.
       */
      all: Place[];
      /** 회피를 적용한 뒤 남은 가게. 뽑기의 바탕이다. */
      pool: Place[];
      /** 지금 화면에 보이는 가게. */
      places: Place[];
      /** 지금 창 크기. `다른 가게 보기`가 WINDOW_STEP씩 키운다. */
      windowSize: number;
      /** 회피가 몇 곳을 뺐는지. 0이면 안내 줄을 그리지 않는다. */
      removed: number;
      /** 전부 빠져 이번만 풀었는지. */
      released: boolean;
    }
  | { kind: "visits" }
  | { kind: "empty"; radius: number }
  | { kind: "error"; code: string; message: string; radius: number };
```

회피 스위치와 기록은 화면 상태 밖에 둡니다. 새로고침하면 사라지는 화면 상태와 달리
저장소에서 읽어야 하기 때문입니다.

```ts
// 저장소는 브라우저에서만 얻을 수 있다. 서버에서 그릴 때는 null이다.
const [store] = useState<Store | null>(() => browserStore());
const [avoidOn, setAvoidOn] = useState(true);
const [visits, setVisits] = useState<Visit[]>([]);

// 처음 그려진 뒤에 기록을 읽는다. 서버와 브라우저의 첫 화면이 달라지면
// React가 경고를 내고, 최악에는 화면이 통째로 다시 그려져 포커스 처리가 무효가 된다.
useEffect(() => {
  setVisits(readVisits(store));
}, [store]);
```

- [ ] **단계 2: 종류를 고를 때 회피와 창을 적용한다**

```ts
function choose(chosen: Cuisine) {
  if (view.kind !== "candidates") return;
  const all = view.result.places.filter((place) => place.cuisineId === chosen.id);
  const { places: pool, removed, released } = avoidVisited(all, visits, avoidOn);
  setView({
    kind: "result",
    cuisine: chosen,
    all,
    pool,
    places: pickPlaces(pool, PLACE_COUNT, [], Math.random, WINDOW_STEP),
    windowSize: WINDOW_STEP,
    removed,
    released,
  });
}

function reshufflePlaces() {
  if (view.kind !== "result") return;
  // 창을 한 단계 넓힌다. 넓히지 않으면 여덟 곳을 다 본 뒤 버튼이 아무 일도 안 한다.
  const windowSize = view.windowSize + WINDOW_STEP;
  setView({
    ...view,
    windowSize,
    places: pickPlaces(view.pool, PLACE_COUNT, view.places, Math.random, windowSize),
  });
}

function decided(place: Place) {
  recordVisit(store, place.id, place.name);
  setVisits(readVisits(store));
}

function toggleAvoid() {
  const next = !avoidOn;
  setAvoidOn(next);
  if (view.kind !== "result") return;
  // 지금 보고 있는 종류를 새 설정으로 다시 계산한다.
  // 그러지 않으면 스위치를 눌러도 화면이 그대로라 껐는지 켰는지 알 수 없다.
  //
  // **바탕은 view.pool이 아니라 view.all이다.** pool은 이미 걸러진 목록이라,
  // 그것을 바탕으로 쓰면 회피를 꺼도 빠졌던 가게가 돌아오지 않는다.
  const { places: pool, removed, released } = avoidVisited(view.all, visits, next);
  setView({
    ...view, pool, removed, released,
    windowSize: WINDOW_STEP,
    places: pickPlaces(pool, PLACE_COUNT, [], Math.random, WINDOW_STEP),
  });
}
```

`decided`가 기록을 바꾼 뒤에도 같은 문제가 있습니다. 방금 정한 가게가 지금 화면에서
바로 사라지면 사용자는 무슨 일이 일어났는지 알 수 없습니다. **지금 보고 있는 결과
화면은 그대로 두고, 다음 조회부터 반영합니다.** 대신 그 가게에 `정하신 곳` 표시를 붙여
기록됐다는 것을 알립니다.

- [ ] **단계 3: 결과 화면을 고친다**

`web/components/ResultScreen.tsx`:

```tsx
type Props = {
  cuisine: Cuisine;
  places: Place[];
  total: number;
  notice: string | null;
  onDecide: (place: Place) => void;
  decidedIds: readonly string[];
  onReshuffle: () => void;
  onRestart: () => void;
};
```

- 맨 위에 `notice`가 있을 때만 안내 줄과 `다시 넣기` 버튼을 그립니다.
- 가게마다 `distanceLabel(place.distance)`를 그립니다.
- **장소 ID가 빈 가게에는 `여기로 정했어요` 버튼을 그리지 않습니다.** 눌러도 기록되지
  않으므로 있으면 거짓말이 됩니다.
- 이미 기록된 가게에는 버튼 대신 `정하신 곳`이라고 표시합니다.

- [ ] **단계 4: 후보 카드에 곳 수를 붙인다**

`web/components/CandidateScreen.tsx`가 `Cuisine[]`을 받아 `label`과
`countLabel(count)`를 두 줄로 그리게 합니다.

- [ ] **단계 5: 시작 화면에 기록 링크를, 빈 결과 문구에서 반경을 뺀다**

`StartScreen.tsx`에 `최근 기록 보기` 버튼을 더합니다(누르면 `visits` 화면으로).

`page.tsx`의 빈 결과 안내에서 반경을 뺍니다.

```tsx
title="주변에서 음식점을 찾지 못했어요"
```

지금 문구는 "반경 500m 안에 음식점이 없어요"인데, 다섯 지점을 보게 되면 실제로 살펴본
범위가 그 반경과 달라 사실이 아니게 됩니다.

- [ ] **단계 6: 기록 화면을 만든다**

`web/components/VisitsScreen.tsx`:

```tsx
type Props = {
  visits: readonly Visit[];
  avoidOn: boolean;
  onToggleAvoid: () => void;
  onForget: (placeId: string) => void;
  onForgetAll: () => void;
  onBack: () => void;
};
```

- 기록이 비어 있으면 "아직 정하신 곳이 없어요"를 보여 줍니다.
- 각 줄에 상호와 날짜, 지우는 버튼을 둡니다.
- 회피 스위치를 둡니다. 스위치에는 `<button aria-pressed={avoidOn}>`을 씁니다 —
  체크박스보다 화면 낭독기가 상태를 정확히 읽습니다.

- [ ] **단계 7: 검증한다**

실행: `cd web && npm run build && npm test && npx tsc --noEmit && npm run lint`
예상: 전부 통과.

브라우저로 직접 확인합니다. 화면 조각에는 자동 시험이 없으므로 이 확인이 유일한
안전망입니다. 서버를 켜고(`just dev`) 아래를 순서대로 봅니다.

1. 기록이 빈 상태에서 결과 화면에 **안내 줄이 없는지**
2. `여기로 정했어요`를 누르고 처음부터 다시 해서 그 가게가 **빠지는지**
3. 안내 줄과 `다시 넣기`가 뜨는지, `다시 넣기`를 누르면 그 가게가 **돌아오는지**
4. `다른 가게 보기`를 여러 번 눌러 **더 먼 가게가 나오는지**
5. 기록 화면에서 한 줄 지우기·전체 지우기·회피 스위치가 도는지
6. 키보드만으로 모든 버튼에 닿는지, 화면이 바뀔 때 포커스가 맨 위로 가는지

- [ ] **단계 8: 커밋한다**

```bash
git add web/
git commit -m "feat(web): 기록·회피·이유를 화면에 붙이기

결과 화면에 '여기로 정했어요'와 회피 안내를, 후보 카드에 곳 수를, 가게마다
거리와 도보 시간을 붙였다. 기록 화면을 새로 두어 한 줄씩·전체를 지우고
회피를 껐다 켤 수 있게 했다.

장소 ID가 빈 가게에는 기록 버튼을 그리지 않는다. 눌러도 기록되지 않으므로
있으면 거짓말이 된다.

빈 결과 문구에서 반경을 뺐다. 다섯 지점을 보게 되면 실제로 살펴본 범위가
요청 반경과 달라 '반경 500m 안에 없어요'가 사실이 아니게 된다."
```

---

### 작업 11: 디자인 컨셉 적용

**파일:**
- 고침: `web/app/globals.css`, `web/app/layout.tsx`, 화면 조각 전부

**설계 근거(설계 문서 6절):** 컨셉은 "단골집 주인장" — 기억하되 티 내지 않고, 묻지 않고
내놓고, 싫다면 바로 바꿔 주고, 가르치지 않는다.

- [ ] **단계 1: 글꼴을 시스템 스택으로 바꾼다**

`web/app/layout.tsx`에서 `Geist`·`Geist_Mono` 호출을 지웁니다.

`web/app/globals.css`의 `body`에 스택을 둡니다.

```css
body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
    "Pretendard Variable", Pretendard,
    system-ui, "Segoe UI", "Malgun Gothic", "Noto Sans KR", sans-serif;
}
```

**웹폰트를 넣지 않는 근거**: 직접 빌드해서 쟀습니다. Pretendard 통짜는 2,009 KB,
Noto Sans KR을 `next/font/google`로 넣으면 첫 화면에만 213 KB입니다. 시스템 글꼴은 0 KB이고
한국어 시스템 글꼴은 주요 플랫폼에서 이미 좋습니다. 스택에 Pretendard를 넣어 두면
그것을 설치한 사용자는 비용 없이 그 글꼴을 봅니다.

- [ ] **단계 2: 디자인 토큰을 둔다**

`web/app/globals.css`의 `@theme inline` 블록을 넓힙니다.

```css
:root {
  /* 종이 같은 따뜻한 중성색. 순백은 눈이 피로하다. */
  --background: #faf9f7;
  --foreground: #1c1a17;
  --muted: #6b6560;
  --line: #e5e1db;
  /* 강조는 결과와 주요 버튼에만. 여러 곳에 뿌리면 무엇이 중요한지 알 수 없다.
     테라코타를 고른 것은 톤 판단이지 연구 근거가 아니다 —
     "빨강이 식욕을 자극한다"는 통념은 2020년 연구가 직접 반박했다. */
  --accent: #b8552f;
  --accent-ink: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #171513;
    --foreground: #f0ece6;
    --muted: #a39c94;
    --line: #322e2a;
    --accent: #e07a4f;
    --accent-ink: #1c1a17;
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-line: var(--line);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
}
```

**대비를 반드시 확인합니다.** 본문은 4.5:1 이상이어야 합니다. 브라우저 개발자 도구의
대비 검사나 온라인 대비 계산기로 `--foreground` 대 `--background`,
`--muted` 대 `--background`, `--accent-ink` 대 `--accent`를 밝은 화면·어두운 화면
양쪽에서 확인하십시오. 미달이면 값을 조정합니다.

- [ ] **단계 3: 터치 영역과 배치를 맞춘다**

- 모든 버튼의 최소 높이를 **48px**로 둡니다(`min-h-12`).
- 주요 버튼(`시작하기`, `못 고르겠어`, `여기로 정했어요`)을 화면 **아래쪽**에 둡니다.
- 결과의 음식 종류 이름은 **2.5rem 이상**, 나머지 본문은 16px 이상으로 둡니다.

- [ ] **단계 4: 움직임을 넣되 끌 수 있게 한다**

화면 전환에 짧은 페이드와 4px 상승을 넣습니다.

```css
@keyframes rise {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

.rise {
  animation: rise 240ms ease-out;
}

/* 전정기관 장애가 있으면 화면의 움직임이 어지럼증·메스꺼움을 유발한다.
   이 서비스는 서서 걸으며 쓰는 것을 전제하므로 특히 중요하다. */
@media (prefers-reduced-motion: reduce) {
  .rise {
    animation: none;
  }
}
```

**240ms인 근거**: Nielsen Norman Group(2020)이 화면 전환은 200~300ms,
500ms를 넘으면 "끌리는 것처럼 느껴져 짜증난다"고 보고했습니다.

- [ ] **단계 5: 움직임 접근성을 시험이 지키게 한다**

`web/lib/motion.test.ts`를 만듭니다. 브라우저 없이 확인할 수 있는 형태입니다.

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 움직임을 넣은 클래스에는 반드시 prefers-reduced-motion 짝이 있어야 한다.
 *
 * **이 그물은 촘촘하지 않다.** 클래스가 아닌 방법(인라인 style, JS 애니메이션)으로
 * 움직임을 넣으면 빠져나간다. 브라우저 없이 도는 시험으로 잡을 수 있는 최선이고,
 * 잡히지 않는 경로가 있다는 사실을 여기 정직하게 적어 둔다.
 */
describe("움직임 접근성", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  it("애니메이션을 선언한 곳이 있다", () => {
    expect(css).toMatch(/@keyframes/);
  });

  it("prefers-reduced-motion 블록이 있다", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("선언한 모든 애니메이션 이름이 reduce 블록에서 꺼진다", () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const reduceBlock = css.slice(css.indexOf("prefers-reduced-motion"));
    for (const name of names) {
      // 그 이름을 쓰는 클래스가 reduce 블록에서 animation: none을 받는지 본다.
      const users = [...css.matchAll(new RegExp(`\\.([\\w-]+)\\s*\\{[^}]*animation:\\s*${name}`, "g"))]
        .map((m) => m[1]);
      for (const cls of users) {
        expect(reduceBlock).toContain(`.${cls}`);
      }
    }
  });
});
```

실행: `cd web && npx vitest run lib/motion.test.ts`
예상: PASS.

`prefers-reduced-motion` 블록을 잠시 지워 시험이 실패하는지 확인한 뒤 되돌립니다.

- [ ] **단계 6: 브라우저로 확인한다**

`just dev`로 띄우고 아래를 봅니다.

1. 밝은 화면과 어두운 화면(OS 설정을 바꿔서) 양쪽에서 글자가 읽히는지
2. OS의 "동작 줄이기"를 켜면 전환 애니메이션이 사라지는지
3. 좁은 화면(휴대폰 크기)에서 가로 스크롤이 생기지 않는지
4. 한 손으로 주요 버튼에 닿는지

- [ ] **단계 7: 접근성 감사를 돌린다**

`web-design-guidelines` 스킬로 화면 코드를 감사합니다. 지적된 것 중 이 설계와
어긋나지 않는 것을 반영합니다.

- [ ] **단계 8: 커밋한다**

```bash
git add web/
git commit -m "feat(web): 디자인 컨셉 '단골집 주인장' 적용

종이 같은 따뜻한 중성색 바탕에 강조색 하나를 결과와 주요 버튼에만 쓴다.
'빨강이 식욕을 자극한다'는 통념은 2020년 동료심사 연구가 직접 반박했으므로
색은 톤과 가독성 기준으로 정했다.

한글 웹폰트를 넣지 않고 시스템 스택을 쓴다. 직접 빌드해서 재 보니 Pretendard
통짜는 2,009 KB, Noto Sans KR은 첫 화면에만 213 KB였다. 30초 쓰고 닫는
도구에 맞지 않는다. 스택에 Pretendard를 넣어 두어 설치한 사용자는 비용 없이
그 글꼴을 본다.

전환 애니메이션은 240ms다. 500ms를 넘으면 '끌리는 것처럼 느껴져 짜증난다'는
연구가 근거다. prefers-reduced-motion을 지키고, 선언한 애니메이션이 전부
그 블록에서 꺼지는지 시험이 대조한다 — 클래스가 아닌 방법으로 넣은 움직임은
잡지 못한다는 한계도 시험 주석에 적었다."
```

---

### 작업 12: 문서 갱신

**파일:**
- 고침: `README.md`

- [ ] **단계 1: 달라진 동작을 반영한다**

`README.md`에서 아래를 고칩니다.

- 화면 설명에 기록 화면을 더합니다.
- 동작 순서도(mermaid)에 다섯 지점 조회와 거리 재계산을 반영합니다.
- 폴더 구조에 `api/internal/geo/`, `web/lib/visits.ts`, `web/lib/avoid.ts`,
  `web/lib/reasons.ts`, `web/components/VisitsScreen.tsx`를 더합니다.
- "손댈 때 알아 둘 것"의 **"브라우저 저장소를 쓰지 않습니다"를 고칩니다.**
  이제 씁니다. 무엇을 저장할 수 있고 무엇을 저장할 수 없는지 근거와 함께 적습니다.

- [ ] **단계 2: 한계를 정직하게 다시 적는다**

"지금 아는 한계" 절을 아래 내용으로 갱신합니다.

- **반경을 넓혀도 결과가 달라지지 않는다**는 기존 한계는 그대로입니다. 다만 이제
  중심을 옮겨 다섯 지점을 보므로, 요청 반경보다 최대 400m 먼 가게가 섞입니다.
- **음식점이 드문 곳**에서는 카드가 가게 한두 곳짜리가 됩니다. 제주 애월 실측에서
  점심 대상 17곳, 카드 6장 중 3장이 한 곳짜리였고 70%가 500m를 넘었습니다.
- **기록은 이 브라우저에만 있습니다.** 브라우저를 바꾸거나 시크릿 창을 쓰면 없습니다.
- **음식 종류 회피는 없습니다.** 효과의 근거가 없고 약관 해석이 갈립니다.
- **계측이 없어** 회피 기간 14일, 후보 넷 같은 값을 고칠 자료가 모이지 않습니다.

- [ ] **단계 3: 확인한다**

README에 적은 명령을 실제로 실행해 그대로 도는지 확인합니다.

실행: `just check`
예상: 전부 통과.

- [ ] **단계 4: 커밋한다**

```bash
git add README.md
git commit -m "docs: 달라진 동작과 새로 알게 된 한계를 README에 반영

브라우저 저장소를 쓰지 않는다는 기존 서술을 고쳤다. 이제 쓴다 — 사용자가
직접 정한 가게의 장소ID와 상호만, 카카오가 명시적으로 허용한 범위에서.

드문 지역 실측(제주 애월 점심 대상 17곳, 70%가 500m 초과, 최대 867m)과
계측이 없어 판정되지 않는 값들을 한계에 적었다."
```

---

### 작업 13: 지운 기록 되돌리기 (계획에 없던 것 — 검토가 찾음)

**이 작업은 원래 계획 열두 개에 없었습니다.** 작업 11(디자인)의 검토가 "기록을 지우는 두
버튼에 확인도 되돌리기도 없다"는 것을 찾았고, 설계 문서 6-1절이 컨셉의 "강압적이지 않음"을
"짧은 상호작용과 **되돌리기 쉬운 버튼**"으로 구현한다고 적고 있어 넣기로 했습니다.
판단의 근거는 `docs/autopilot/lunch-upgrade/DECISIONS.md` 13번에 있습니다.


### 왜 하는가

기록 화면의 `지우기`·`전체 지우기`는 누르면 그대로 사라지고 되돌릴 방법이 없다.
`전체 지우기`는 최대 14일치를 한 번에 없앤다.

이 화면은 **서서 걸으며 한 손으로 쓰는 것을 전제로** 만들었다. 그리고 기록은 이번
고도화의 첫 변경("기억")이 만드는 것이고 회피 기능 전체가 그 위에 선다. 기록이
사라지면 "지난번에 보낸 곳으로 오늘 또 보낸다"는 원래 문제로 그대로 돌아간다.

**확인 대화상자는 넣지 않는다.** 설계 문서 6-1절이 컨셉의 "강압적이지 않음"을
**"짧은 상호작용과 되돌리기 쉬운 버튼"**으로 구현한다고 적고 있다. 같은 절의
"재확인 질문 없음"은 점심을 내놓는 동작에 관한 말이지 데이터를 없애는 동작이 아니다.
그러니 되돌리기는 컨셉과 어긋나기는커녕 컨셉이 요구하는 쪽이다.

### 만드는 것

지운 기록을 잠깐 메모리에 들고, 기록 화면에 "n곳을 지웠어요 · 되돌리기"를 보여 준다.
화면을 벗어나면 되돌리기는 사라진다. **저장소에 휴지통을 만들지 않는다** — 무엇을
저장하는가의 경계는 카카오 약관과 얽혀 있고(설계 문서 9절), 지금 그 경계를 다시 열
이유가 없다.

### 파일

- 수정: `web/lib/visits.ts` — `restoreVisits` 추가
- 수정: `web/lib/visits.test.ts` — 그 시험
- 수정: `web/lib/reasons.ts` — `forgetNotice` 추가
- 수정: `web/lib/reasons.test.ts` — 그 시험
- 수정: `web/app/page.tsx` — 되돌리기 상태와 연결
- 수정: `web/components/VisitsScreen.tsx` — 안내 줄과 버튼

### 인터페이스

이 작업이 만드는 것:

```ts
// web/lib/visits.ts
export function restoreVisits(
  store: Store | null,
  restored: readonly Visit[],
  now?: Date,
): void;

// web/lib/reasons.ts
export function forgetNotice(count: number): string | null;
```

이 작업이 쓰는 것(이미 있고, 서명을 바꾸지 마라):

```ts
// web/lib/visits.ts
export type Visit = { placeId: string; placeName: string; at: string };
export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
export const STORAGE_KEY: string;      // "random-choice.visits.v1"
export const RETENTION_DAYS: number;   // 14
export function readVisits(store: Store | null, now?: Date): Visit[];
export function forgetVisit(store: Store | null, placeId: string, now?: Date): void;
export function forgetAll(store: Store | null): void;
```

`visits.ts` 안에는 이미 `load`·`save`·`withoutExpired`·`isVisit`이 모듈 안쪽 함수로
있다. `restoreVisits`는 그것들을 그대로 쓴다. **새로 만들지 마라.**

---

### 단계

#### 1단계 — `restoreVisits`의 실패하는 시험을 쓴다

`web/lib/visits.test.ts`에 넣는다. 그 파일에 이미 가짜 저장소가 있으니 그것을 쓴다
(없으면 그 파일의 기존 패턴을 그대로 따른다).

시험 넷:

1. **지운 것을 그대로 되돌린다.** 두 곳을 기록하고, 하나를 `forgetVisit`으로 지우고,
   지운 그 항목을 `restoreVisits`로 넣으면 `readVisits`가 다시 두 곳을 돌려준다.
2. **`forgetAll` 뒤에도 되돌아온다.** 세 곳을 기록하고 `forgetAll` 한 뒤 그 셋을
   `restoreVisits`로 넣으면 셋이 전부 돌아온다.
3. **보관 기간이 지난 항목은 되돌리지 않는다.** `at`이 20일 전인 항목을 넣어도
   `readVisits`에 안 나온다. — 이 시험이 `withoutExpired`를 거치는지 지킨다.
4. **같은 장소 ID가 둘이 되지 않는다.** 이미 저장소에 있는 가게를 `restoreVisits`로
   또 넣어도 목록에 한 번만 나온다. `recordVisit`이 같은 규칙을 지키고 있으므로
   같은 규칙을 따른다.
5. **저장소가 null이면 아무 일도 일어나지 않는다.** 예외를 던지지 않는다.

각 시험에 **무엇을 지키는 시험인지 한 줄 주석**을 붙여라. 이 저장소의 관례다.

#### 2단계 — 시험이 실패하는 것을 확인한다

```
cd web && npx vitest run lib/visits.test.ts
```

기대: `restoreVisits`가 없어서 실패.

#### 3단계 — `restoreVisits`를 만든다

`recordVisit` 바로 아래에 둔다. 구조는 `recordVisit`과 같다.

```ts
/**
 * 방금 지운 기록을 되돌린다.
 *
 * <여기에 왜 withoutExpired를 거치는지, 왜 같은 ID를 걸러 내는지 적어라.
 *  recordVisit과 forgetVisit이 그 이유를 이미 적어 두었으니 읽고 맞춰 써라.>
 */
export function restoreVisits(
  store: Store | null,
  restored: readonly Visit[],
  now: Date = new Date(),
): void {
  // 되돌릴 것이 없으면 저장소를 건드리지 않는다.
  // 지금 저장된 것 중 되돌릴 ID와 겹치는 것을 빼고, 되돌릴 것을 붙인 뒤,
  // 만료된 것을 걸러 저장한다.
}
```

본문은 당신이 쓴다. `recordVisit`이 `withoutExpired(load(store), now).filter(...)` 뒤에
`save`를 부르는 모양을 그대로 따르면 된다.

#### 4단계 — `forgetNotice`의 실패하는 시험을 쓰고 만든다

`web/lib/reasons.ts`의 `avoidNotice`가 **뺀 것이 없으면 null을 돌려주고 화면은 줄
자체를 안 그리는** 모양이다. 같은 모양을 따른다.

```ts
export function forgetNotice(count: number): string | null;
```

- `forgetNotice(0)` → `null`
- `forgetNotice(1)` → `"1곳을 지웠어요"`
- `forgetNotice(3)` → `"3곳을 지웠어요"`
- 음수도 `null` (0 이하를 한 갈래로 본다 — `avoidNotice`가 `removed <= 0`으로 그렇게 한다)

시험을 먼저 쓰고 실패를 확인한 뒤 만들어라.

#### 5단계 — 화면에 붙인다

**`web/app/page.tsx`**

기록과 회피 설정이 `View` 밖에 있는 것과 같은 이유로, 되돌릴 목록도 `View` 밖에 둔다.

```ts
const [undoable, setUndoable] = useState<Visit[]>([]);
```

- `forget(placeId)` — 지우기 전에 `visits`에서 그 항목을 골라 두고, 지운 뒤
  `setUndoable(<고른 것>)`.
- `forgetEverything()` — 지우기 전의 `visits` 전체를 `setUndoable`에 넣는다.
- 새 함수 `undoForget()` — `undoable`이 비어 있으면 아무것도 안 한다. 아니면
  `restoreVisits(store, undoable)` → `setVisits(readVisits(store))` → `setUndoable([])`.
- `onBack`에서 `setUndoable([])`. **화면을 벗어나면 되돌리기가 사라진다는 것이
  이 설계의 전제다.** 여기를 빠뜨리면 다음에 기록 화면에 들어왔을 때 오래된 안내가
  떠 있고, 누르면 사용자가 잊은 항목이 되살아난다.

**`web/components/VisitsScreen.tsx`**

새 Props 둘:

```ts
/** 방금 지운 곳 수. 0이면 안내 줄을 그리지 않는다. 문구는 web/lib/reasons.ts가 만든다. */
undoneCount: number;
onUndo: () => void;
```

안내 줄은 목록 **위**(회피 스위치 아래)에 둔다. 지운 직후 눈이 가 있는 자리다.

- `forgetNotice(undoneCount)`가 `null`이면 줄 자체를 그리지 않는다.
- 안내 줄에는 **`aria-live="polite"`**를 단다. 이 화면에는 지금 낭독기 통지 영역이
  하나도 없다 — 다른 화면 셋(`StartScreen`·`CandidateScreen`·`ResultScreen`)에는 있다.
  지우기가 성공했다는 사실이 낭독기 사용자에게 전혀 전달되지 않고 있었다.
- `되돌리기` 버튼은 `btn btn-quiet btn-sm`을 쓴다. 강조색을 쓰지 마라 — 강조색은
  결과와 주요 버튼 전용이다.
- 결과 화면의 `bg-surface` 안내 상자와 같은 모양을 쓰면 화면 사이 일관성이 선다.
  **그 상자에 테두리가 있는지 확인하고 맞춰라** — 바로 앞 작업에서 손댄 자리다.

**포커스**

지금 `지우기`를 누르면 그 버튼이 든 줄이 통째로 사라져 포커스가 `body`로 떨어진다.
키보드·낭독기 사용자는 자기가 어디 있는지 잃는다. 이것은 이 작업 전부터 있던 결함이고,
되돌리기를 붙이면서 제대로 고칠 수 있다.

- **지운 직후 포커스를 `되돌리기` 버튼으로 옮긴다.** 사라진 자리를 대신하고, 되돌리는
  것이 바로 다음에 하고 싶을 만한 일이며, 되돌리기는 파괴적이지 않다.
- **되돌린 직후**에는 안내 줄이 사라지므로 포커스를 `최근에 정하신 곳` 제목으로 옮긴다.
  `tabIndex={-1}`과 `ref`가 필요하다. `ResultScreen`이 "정하신 곳"에 쓰는 것과 같은 수법이니
  그 코드를 읽고 맞춰 써라.

이 두 가지는 node 시험으로 확인할 수 없다. **실제 브라우저로 확인하고 관찰한 것을
보고에 적어라.** `document.activeElement`를 찍어 보면 된다.

#### 6단계 — 방어를 껐을 때 시험이 실제로 실패하는지 확인한다

**이 단계를 건너뛰지 마라.** 이 저장소에서 아무것도 지키지 않는 시험이 지금까지 열한 개
나왔다. 통과하는 시험은 증거가 아니다.

두 가지를 일부러 망가뜨리고 각각 어느 시험이 실패하는지 확인한다.

1. `restoreVisits`에서 `withoutExpired` 호출을 뺀다 → 1단계의 셋째 시험이 실패해야 한다.
2. `restoreVisits`에서 같은 ID를 거르는 `filter`를 뺀다 → 넷째 시험이 실패해야 한다.
3. `forgetNotice`의 `count <= 0` 갈래를 없앤다 → 그 시험이 실패해야 한다.

**실패하지 않는 것이 있으면 그 시험이 헛도는 것이다.** 시험을 고치고 다시 확인하라.
망가뜨린 코드는 전부 되돌린 뒤 다음 단계로 간다.

#### 7단계 — 전체 검사와 커밋

```
just check
```

서버 시험·`go vet`, 화면 빌드·시험·타입 검사·린트가 전부 통과해야 한다.

커밋할 때는 파일을 하나씩 지정해 스테이징한다. 전체 스테이징 명령을 쓰지 마라.
`docs/autopilot/lunch-upgrade/STATE.md`는 절대 스테이징하지 마라.
커밋 메시지는 한국어, Conventional Commits 형식.

---

### 경계

- **`api/`를 건드리지 않는다.** 서버는 이 작업과 무관하다.
- **`README.md`를 건드리지 않는다.** 문서 갱신은 따로 한다.
- **새 의존성을 넣지 않는다.** `web/package.json`은 변경 대상이 아니다.
- **저장소에 새 열쇠를 만들지 않는다.** 되돌릴 목록은 메모리에만 있다.
- **`Visit` 타입에 필드를 더하지 않는다.** 세 필드가 카카오 약관이 정한 경계다
  (`web/lib/visits.ts` 맨 위 주석 참고).
- **기존 함수의 서명을 바꾸지 않는다.**
- 화면 시험은 브라우저 없이 돈다(`web/vitest.config.mts`가 `environment: "node"`,
  jsdom도 testing-library도 없다). 새 시험은 전부 `web/lib/`의 순수 함수 수준에 둔다.
  jsdom을 새로 들이지 마라.

---

## 전체 완료 확인

모든 작업이 끝난 뒤 아래를 **실제로 실행하고 출력을 확인**합니다.

- [ ] `cd api && go test ./... && go vet ./...` — 전부 통과
- [ ] `cd web && npm run build && npm test && npx tsc --noEmit && npm run lint` — 전부 통과
- [ ] `git log --oneline` — 작업마다 커밋이 하나씩 있는지
- [ ] 설계 문서 13절의 완료 조건을 한 줄씩 대조
- [ ] 실제 카카오 열쇠로 브라우저에서 한 번 끝까지 해 보기
  (`api/.env`에 열쇠가 있습니다. `just dev`로 두 서버를 함께 켭니다)

**마지막으로 하지 않는 것**: `git push`와 배포. main 병합도 하지 않습니다.
