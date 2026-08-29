# 화면 (Next.js)

이 폴더만으로는 동작하지 않습니다. 화면은 `/api` 요청을 같은 폴더의 `next.config.ts`가
Go 서버로 넘겨 주는 구조라, **Go 서버가 함께 떠 있어야** 음식점 조회가 됩니다.

전체 구조와 실행 방법, 카카오 열쇠 설정은 저장소 루트의 `README.md`를 보세요.

## 이 폴더에서 바로 쓰는 명령

```bash
npm install          # 처음 한 번만
npm run dev          # http://localhost:3000
npm test             # 시험
npm run build        # 배포 빌드
npm run lint
npx tsc --noEmit     # 타입 검사 — npm run build 뒤에 돌려야 한다
```

`npx tsc --noEmit`을 `npm run build`보다 먼저 돌리면 실패합니다. `app/layout.tsx`가 쓰는
`LayoutProps` 타입을 Next.js가 빌드하면서 만들어 주는데, 그 결과물은 저장소에
올라가지 않기 때문입니다.

Go 서버를 8080이 아닌 포트로 띄웠다면 화면 쪽에도 알려 줘야 합니다.

```bash
API_ORIGIN=http://localhost:8090 npm run dev
```

## 폴더

| 경로 | 무엇 |
|------|------|
| `app/page.tsx` | 시작·후보·결과 세 화면 사이의 이동을 관리한다 |
| `app/error.tsx` | 화면을 그리다 실패했을 때의 안내 |
| `components/` | 화면 조각 넷 |
| `lib/pick.ts` | 무작위 추첨 규칙 (난수 생성기를 밖에서 받는 순수 함수) |
| `lib/api.ts` | Go 서버 호출 |
| `lib/geo.ts` | 브라우저에 현재 위치 묻기 |
| `lib/errors.ts` | 오류 코드 → 화면 안내 문구 |
| `lib/radius.ts` | 결과가 없을 때 넓힐 반경 고르기 |

시험은 `lib/` 아래 순수 함수와 통신 계층을 덮습니다. 화면 조각(`components/`, `app/`)에는
자동 시험이 없고, 그 까닭은 `docs/superpowers/specs/2026-08-29-lunch-random-picker-design.md`의 14절에 적혀 있습니다.
`vitest.config.mts`의 `include`는 `{lib,app,components}`까지 열려 있으므로,
화면 시험을 추가하면 조용히 무시되지는 않습니다(다만 `jsdom`이 없어 환경 부족으로 실패합니다).
