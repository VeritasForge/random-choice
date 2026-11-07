---
name: 오늘은 뭐 먹지?
description: 따뜻한 종이색 바탕에 테라코타 한 가지만 강조하는, 말이 짧고 되돌리기 쉬운 점심 결정 도구.
colors:
  paper: "#faf9f7"
  ink: "#1c1a17"
  tea-grey: "#6b6560"
  lower-paper: "#f0ede8"
  clay-line: "#8f857a"
  terracotta: "#b8552f"
  terracotta-ink: "#ffffff"
  paper-night: "#171513"
  ink-night: "#f0ece6"
  tea-grey-night: "#a39c94"
  lower-paper-night: "#232019"
  clay-line-night: "#736b62"
  terracotta-night: "#e07a4f"
  terracotta-ink-night: "#1c1a17"
typography:
  display:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.11
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.56
  button:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
  caption:
    fontFamily: "'Noto Serif KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', Pretendard, system-ui, 'Segoe UI', 'Malgun Gothic', 'Noto Sans KR', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  field: "12px"
  card: "16px"
  pill: "9999px"
spacing:
  "2": "8px"
  "3": "12px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.terracotta-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "48px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "48px"
  button-accent-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.terracotta}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "48px"
  button-danger-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.tea-grey}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "48px"
  cuisine-card:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.card}"
    padding: "12px"
    height: "112px"
  notice-box:
    backgroundColor: "{colors.lower-paper}"
    textColor: "{colors.tea-grey}"
    typography: "{typography.caption}"
    rounded: "{rounded.field}"
    padding: "12px"
  place-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "12px"
  search-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
---

# Design System: 오늘은 뭐 먹지?

## Overview

**Creative North Star: "단골집 주인장"**

묻지 않고 내놓고, 싫다면 바로 바꿔 주고, 말이 짧은 가게 주인을 화면의 성격으로 삼습니다. 이 성격은 장식이 아니라 구조로 나타납니다. 결과는 한 덩어리로 단정하게 내놓고, 흐름은 재확인 없이 짧게 이어지며, 모든 선택은 버튼 하나로 되돌릴 수 있습니다. 색, 글꼴, 움직임은 이 세 가지를 방해하지 않는 선에서만 고릅니다.

분위기는 따뜻하고, 차분하면서 또렷하며, 유쾌합니다. 따뜻함은 종이색 바탕과 테라코타 한 가지 강조색에서, 또렷함은 모든 글자와 경계선이 지키는 명암비에서 나옵니다. 유쾌함은 그림이나 장식이 아니라 말투에서 나옵니다. "못 고르겠어요, 정해 주세요"처럼 사용자의 사정을 먼저 알아주는 짧은 `~해요` 체가 그 자리를 맡습니다.

밀도는 낮고, 한 화면에서 해야 할 일은 하나입니다. 가장 중요한 요소(결과 종류 이름 또는 강조색 버튼)가 화면에서 한 곳에만 나타나고, 걸으면서 한 손으로 쓰는 상황을 전제로 모든 누를 곳을 엄지가 닿는 아래쪽에 모읍니다.

**Key Characteristics:**
- 종이색 바탕, 강조색은 테라코타 하나, 그림자와 그라데이션 없음
- 누를 수 있는 것은 최소 48px, 글자는 16px 이상(위치 안내와 검색 결과의 곁글만 14px)
- 알약형 버튼과 둥근 사각형 상자 두 가지 형태만 사용
- 웹폰트는 Noto Serif KR 하나만 사용(시작 화면 363KB, 결과 화면까지 493KB)
- 밝은 화면과 어두운 화면이 같은 구조로 짝을 이룸

## Colors

따뜻한 중성색 위에 테라코타 한 가지를 얹은 팔레트입니다. 모든 값은 명암비를 직접 계산해 정했고, 어두운 화면은 같은 역할의 값이 짝으로 따로 있습니다(이름 뒤에 `-night`).

### Primary
- **구운 흙빛 테라코타** (`#b8552f` / 어두운 화면 `#e07a4f`): 결과 종류 이름과 화면당 하나뿐인 주요 버튼, 그리고 목록 줄 안의 주요 동작 테두리에만 쓰는 강조색입니다. 바탕 대비 4.56:1(밝은 화면), 6.13:1(어두운 화면)입니다. 그 위에 올라가는 글자색 `terracotta-ink`(`#ffffff` / `#1c1a17`)는 강조색 대비 4.80:1, 5.84:1입니다.

### Neutral
- **마른 쌀종이** (`#faf9f7` / `#171513`): 화면 바탕입니다. 순백과 순흑은 눈이 피로해서 쓰지 않습니다.
- **그을린 먹색** (`#1c1a17` / `#f0ece6`): 본문과 제목 글자입니다. 바탕 대비 16.50:1, 15.48:1입니다.
- **우린 찻빛 회색** (`#6b6560` / `#a39c94`): 거리, 날짜, 부연 설명 같은 곁글입니다. 바탕 대비 5.46:1, 6.71:1입니다.
- **한 단 낮은 종이** (`#f0ede8` / `#232019`): 안내 상자의 바닥입니다. 바탕보다 한 단 어둡게만 내려갑니다.
- **마른 진흙 선** (`#8f857a` / `#736b62`): 버튼과 카드의 경계선입니다. 바탕 대비 3.44:1, 3.48:1로 비텍스트 대비 하한인 3:1을 넘습니다.

### Named Rules
**The One Voice Rule.** 테라코타는 결과와 주요 버튼에만 씁니다. 여러 곳에 뿌리면 무엇이 중요한지 알 수 없게 되므로, 한 화면에서 강조색이 칠해진 버튼은 하나를 넘지 않습니다.

**The Both Faces Rule.** 안내 상자(`lower-paper` 바닥 + `clay-line` 테두리)의 안쪽 면 명암비는 3.0986:1, 3.1022:1로 여유가 0.10뿐입니다. `lower-paper`나 `clay-line` 중 하나를 바꾸면 바깥 면(바탕과 맞닿는 쪽)만 재지 말고 안쪽 면도 함께 재야 합니다.

**The No Red-Appetite Rule.** "빨강·노랑이 식욕을 자극한다"는 통념은 근거로 쓰지 않습니다. 테라코타는 연구 근거가 아니라 톤 판단으로 고른 색입니다.

## Typography

**Display / Body / Label Font:** Noto Serif KR 하나(`next/font/google`로 내려받음). 대비책으로 시스템 글꼴 스택(`-apple-system`, `Apple SD Gothic Neo`, `Pretendard Variable`, `Pretendard`, `system-ui`, `Segoe UI`, `Malgun Gothic`, `Noto Sans KR`, `sans-serif`)을 뒤에 둡니다.

**Character:** 간판처럼 또렷한 명조 계열이라 "일본의 작은 노포" 분위기의 바탕이 됩니다. 라틴과 한글을 한 글꼴로 그리므로 "240m · 도보 4분"처럼 한 줄 안에서 두 글꼴이 나란히 놓이지 않습니다.

### Hierarchy
- **Display** (700, 3rem, 1.25, `-0.025em`): 결과 화면에서 고른 음식 종류 이름 하나에만 씁니다. 강조색으로 칠합니다.
- **Headline** (700, 2.25rem, 1.11, `-0.025em`): 시작 화면의 서비스 이름입니다.
- **Title** (700, 1.5rem, 1.33, `-0.025em`): 화면마다 하나인 제목입니다(예: "어느 쪽이 끌리나요?", "어디에서 찾을까요?").
- **Body** (400, 1rem, 1.625): 안내 문단입니다. 줄 길이는 `max-w-xs`~`max-w-sm`(20~24rem)로 제한합니다.
- **Label** (600, 1.125rem, 1.56): 가게 이름, 음식 종류 카드의 이름처럼 눌러서 고르는 대상의 이름입니다.
- **Button** (600, 1rem, 1.3): 모든 버튼의 글자입니다.
- **Caption** (400, 0.875rem, 1.43): 14px 글자입니다. 현재 쓰이는 곳은 후보·결과 화면의 "첨성대에서 찾았어요" 위치 안내, 검색 화면의 장소 분류와 주소 줄, 검색 오류 설명, 검색 화면 하단 안내 문구입니다. 버튼과 가게 이름, 거리·날짜에는 쓰지 않습니다.

### Named Rules
**The 16px Floor Rule.** 서서 보는 화면이므로 버튼, 가게 이름, 거리, 날짜의 글자 하한은 16px입니다. 버튼 글자를 줄이는 방식으로 줄 안의 작은 버튼을 만들지 않습니다. 줄이는 것은 좌우 여백뿐입니다. 14px(Caption)는 위 Hierarchy에 나열한 곁글에만 남아 있으며, 새로 늘리지 않습니다.

**The One Webfont Rule.** 웹폰트는 Noto Serif KR 하나만 씁니다. 느린 4G 수준 회선에서 재 본 결과 시작 화면 363KB, 가게 이름까지 나온 결과 화면 493KB이고 화면 흔들림(CLS)은 0.0081이었습니다. 글꼴을 더하거나 바꾸기 전에 같은 방식으로 다시 재서 이 기준(흔들림 0.1 미만)을 넘지 않는지 확인합니다. 고운바탕은 1.7MB라 쓰지 않았습니다.

**The Tabular Distance Rule.** 거리처럼 숫자가 세로로 늘어서는 곳에는 `tabular-nums`를 써서 자리폭을 고정합니다.

## Layout

화면 전체는 가운데 정렬된 단일 열입니다. 본문 폭은 최대 `28rem`(448px)이고, 바깥 여백은 24px, 구역 사이 간격은 32px입니다. 높이는 `100dvh`를 채우고, 화면마다 위쪽 덩어리가 남는 공간을 위아래로 나눠 가져(`my-auto`) 버튼 묶음이 맨 아래로 내려갑니다. 결과 화면만 예외로, 덩어리를 위에 붙이고 버튼 묶음에 `mt-auto`를 줍니다. 결정 직후 마무리 상자가 생길 때 제목과 목록이 밀리지 않게 하기 위해서입니다. 관찰 조사에서 한 손 그립이 49%, 전체 터치의 75%가 엄지였기 때문에 주요 버튼을 엄지가 닿는 아래쪽에 두는 것입니다.

간격은 8px(`gap-2`, 버튼 안 요소 사이), 12px(`gap-3`, 세로로 쌓인 버튼 사이), 20px(`gap-5`, 제목과 본문 사이), 24px(`gap-6`, 제목과 카드 묶음 사이)를 씁니다. 하단 여백은 `env(safe-area-inset-bottom)`과 24px 중 큰 값입니다. 음식 종류 후보는 두 열 격자(`grid-cols-2`, 간격 12px)입니다.

화면 전환은 짧은 페이드와 4px 상승(240ms)입니다. `prefers-reduced-motion`에서는 이 움직임을 끕니다.

## Elevation & Depth

그림자, 그라데이션, 블러를 쓰지 않는 평면 구조입니다. 깊이는 두 가지로만 전달합니다. 하나는 1px 경계선(`clay-line`)이고, 다른 하나는 바탕보다 한 단 낮은 종이색(`lower-paper`) 바닥입니다. 키보드 포커스는 요소 바깥으로 2px 띄운 `ink` 색 외곽선으로 보여 줍니다. 요소 위에 겹치면 강조색 버튼 위에서 명암비가 2.53:1까지 떨어지기 때문입니다.

### Named Rules
**The Flat-By-Default Rule.** 면은 가만히 있을 때 평평합니다. 상태가 바뀔 때(호버, 눌림, 포커스)만 색이 바뀌고, 위치나 그림자는 바뀌지 않습니다.

**The Hover-Only-Where-Hover-Exists Rule.** 호버 스타일은 `@media (hover: hover)` 안에만 둡니다. 손가락으로 누르는 기기에서 호버는 "누른 뒤 그대로 남는 색"이 되어 방금 누른 버튼이 계속 눌린 것처럼 보입니다.

## Shapes

형태 언어는 두 가지입니다. 누르는 동작은 알약(`9999px`)이고, 정보를 담는 상자는 둥근 사각형입니다. 상자는 입력칸, 안내 상자, 목록 줄이 `12px`, 음식 종류 카드가 `16px`입니다. 테두리는 항상 1px입니다. 장식용 도형이나 클리핑은 없습니다.

## Components

### Buttons
- **Shape:** 알약형(`9999px`), 최소 높이·너비 48px, 안쪽 여백 `12px 20px`, 글자 16px 600
- **Primary (`btn-primary`):** 강조색 바탕에 강조 글자색. 화면마다 하나뿐이며 그 화면의 다음 걸음을 가리킵니다. 호버에서 강조색 88%에 `ink` 12%를 섞어 어둡게 합니다.
- **Quiet (`btn-quiet`):** 바탕 없이 1px `clay-line` 테두리와 `ink` 글자. 되돌리기·다시 하기처럼 언제 눌러도 되는 버튼입니다. 호버에서 `lower-paper`로 채우고 테두리를 `ink`로 진하게 합니다.
- **Accent Quiet (`btn-accent-quiet`):** 목록 줄 안의 주요 동작("여기로 정했어요")입니다. 칠하지 않고 테두리와 글자만 강조색으로 둡니다. 네 줄이 모두 칠해지면 정작 결과가 묻히기 때문입니다. 호버에서 강조색으로 꽉 채우고 글자를 뒤집습니다(`lower-paper` 위에 강조색 글자를 올리면 4.11:1로 떨어지기 때문에 `lower-paper`로는 채우지 않습니다).
- **Danger Quiet (`btn-danger-quiet`):** 되돌릴 수 없는 지우기("전체 지우기") 전용입니다. 글자와 테두리를 `tea-grey`로 한 단 물려 "여기가 다음 걸음이 아니다"를 옷으로 말합니다. 강조색은 쓰지 않습니다.
- **Small (`btn-sm`):** 줄 안에 들어가는 버튼입니다. 좌우 여백만 14px로 줄이고 높이 48px과 글자 크기는 그대로 둡니다.
- **Text Link:** 시작·검색 화면의 "최근 기록 보기", "돌아가기"는 테두리 없이 `tea-grey` 글자에 밑줄(`underline-offset: 4px`)만 둡니다.
- **Disabled:** `disabled` 속성이 아니라 `aria-disabled="true"`를 씁니다(포커스를 유지하기 위해). 불투명도 0.6으로 흐리게 그립니다.

### Cuisine Cards
- **Style:** 후보 화면의 음식 종류 선택 카드. 바탕 없이 1px `clay-line` 테두리, 모서리 16px, 최소 높이 112px, 세로 정렬
- **Content:** 종류 이름(Label, 18px 600)과 그 아래 "주변 28곳" 곁글(16px, `tea-grey`)

### Notice Boxes
- **Style:** `lower-paper` 바닥, 1px `clay-line` 테두리, 모서리 12px, 안쪽 여백 12px
- **Use:** 위치 기준 안내("첨성대에서 찾았어요" + `바꾸기`), 지난번 가게를 뺐다는 안내, 기록 화면의 되돌리기 안내

### Decision Closure (결과 화면)
- **Style:** Notice Boxes와 같은 모양(`lower-paper` 바닥, 1px `clay-line` 테두리, 모서리 12px). 가운데 정렬로 "맛있게 드세요"(18px, 600), 그 아래 "정하신 곳은 14일 동안 기록에 남아요"(16px `tea-grey`), `기록 보기` 작은 버튼
- **Use:** "여기로 정했어요"가 실제로 기록된 직후에만 목록 아래에 나타납니다. 가게 이름은 넣지 않습니다(조사 문제). 움직임은 화면 전환과 같은 `rise` 하나뿐입니다.

### Place Rows
- **Style:** 1px `clay-line` 테두리, 모서리 12px, 안쪽 여백 12px. 위에 가게 이름(Label, 항상 밑줄, 두 줄까지), 아래에 "240m · 도보 4분 · 주소"(16px `tea-grey`, `tabular-nums`, 두 줄까지). 링크가 없는 줄은 자르지 않고 전부 보여 줍니다. 밑줄을 항상 두는 것은 손가락 기기에 호버가 없기 때문입니다.
- **Hit Area:** 가게 이름 링크에 보이지 않는 겹침 층을 깔아 줄 전체가 눌립니다. 이 링크에는 `position`을 주지 않습니다(담는 상자가 줄 전체여야 하기 때문입니다). 동작 버튼은 그 층 위로 올립니다.

### Inputs / Fields
- **Style:** 바탕 없음, 1px `clay-line` 테두리, 모서리 12px, 안쪽 여백 `8px 12px`
- **Focus:** 바깥 2px 띄운 `ink` 외곽선(공통 포커스 규칙)
- **Label:** 눈에 보이는 이름표 대신 `sr-only` 이름표를 둡니다.

### Toggle Row (기록 화면)
- **Style:** 전체 폭 버튼, 1px 테두리, 모서리 12px, 안쪽 여백 16px. 켜짐일 때 테두리가 `ink`로, 꺼짐일 때 `clay-line`으로 바뀝니다. 오른쪽에 "켜짐"/"꺼짐" 글자를 함께 적어 색에만 의존하지 않습니다.

## Do's and Don'ts

### Do:
- **Do** 한 화면에 강조색 버튼을 하나만 둡니다. 막다른 화면(`Notice`)에서도 맨 앞 버튼만 강조색입니다.
- **Do** 새 색을 만들면 본문은 4.5:1, 경계선은 3:1 이상인지 직접 재어 주석에 근거를 남깁니다. 상자는 안쪽 면과 바깥 면을 모두 잽니다.
- **Do** 누를 수 있는 모든 것은 높이·너비 48px 이상으로 만듭니다. 줄 안의 버튼도 높이는 줄이지 않습니다.
- **Do** 상태 변화는 색 전환 100ms로 보여 줍니다. 자리를 옮기는 움직임은 화면 전환의 `rise` 하나뿐입니다.
- **Do** 호버 스타일은 `@media (hover: hover)` 안에 두고, 새 움직임을 추가하면 `prefers-reduced-motion`에서도 꺼지게 합니다.
- **Do** 공통 클래스(`btn`, `row` 등)는 `@layer components` 안에 둡니다. 층 밖에 두면 화면 쪽 유틸리티가 조용히 먹히지 않습니다.
- **Do** 켜짐·꺼짐 같은 상태는 색만으로 알리지 말고 글자로도 적습니다.

### Don't:
- **Don't** 귀여운 캐릭터, 마스코트, 이모지 장식, 둥글둥글한 만화풍 일러스트를 넣지 않습니다(사용자가 확정한 거부 사항).
- **Don't** 그림자, 그라데이션, 블러를 추가하지 않습니다. 깊이는 경계선과 종이색 단 차이로만 만듭니다.
- **Don't** 웹폰트를 둘 이상 쓰지 않습니다. 라틴 전용 웹폰트는 한 줄 안에서 두 글꼴을 나란히 놓게 하므로 더욱 그렇습니다.
- **Don't** 줄 안 버튼의 글자 크기를 16px 밑으로 줄이지 않습니다.
- **Don't** 비활성 상태에 `disabled` 속성을 쓰지 않습니다. 포커스가 떨어져 키보드·낭독기 사용자가 자기 위치를 잃습니다.
- **Don't** `btn-danger-quiet`에 강조색을 쓰거나 `btn-quiet`와 같은 옷으로 되돌리지 않습니다. 걸으면서 한 손으로 누르는 사람이 "전체 지우기"와 "돌아가기"를 헷갈립니다.
- **Don't** `.row-link`에 `position`을 주지 않습니다. 눌리는 영역이 글자 상자 크기로 조용히 줄어듭니다.
