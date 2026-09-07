# 자주 쓰는 명령 모음. 인자 없이 `just`만 치면 이 목록이 뜬다.
default:
    @just --list

# API 서버(8090)와 웹 화면(3000)을 한 번에 켠다. Ctrl+C 한 번이면 둘 다 꺼진다.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    # 8080이 아니라 8090을 쓰는 이유: 이 저장소를 쓰는 일부 로컬 환경에서 8080을
    # 이미 다른 프로그램이 쓰고 있기 때문이다(README·인계 문서에 적힌 것과 같은 사정).
    trap 'kill 0' EXIT
    (cd api && { [ -f .env ] && export $(grep -v '^#' .env | xargs); } ; PORT=8090 go run ./cmd/server) &
    (cd web && API_ORIGIN=http://localhost:8090 npm run dev) &
    wait

# API 서버만 켠다 (http://localhost:8090). api/.env에 KAKAO_REST_API_KEY가 있으면 읽는다.
api:
    #!/usr/bin/env bash
    set -euo pipefail
    cd api
    if [ -f .env ]; then
      export $(grep -v '^#' .env | xargs)
    fi
    PORT=8090 go run ./cmd/server

# 웹 화면만 켠다 (http://localhost:3000). 위 API 서버(8090)를 보도록 API_ORIGIN을 넘긴다.
web:
    cd web && API_ORIGIN=http://localhost:8090 npm run dev

# 서버·화면 시험을 모두 돌린다.
test:
    #!/usr/bin/env bash
    set -euo pipefail
    cd api && go test ./...
    cd ../web && npm test

# 커밋 전 전체 검증: 시험, 정적 분석, 빌드, 타입 검사, 린트를 모두 돌린다.
check:
    #!/usr/bin/env bash
    set -euo pipefail
    cd api
    go test ./...
    go vet ./...
    cd ../web
    # tsc보다 build가 먼저인 이유: 타입 검사에 필요한 것을 Next.js가 빌드 중에
    # 만드는데, 그 결과물은 저장소에 올라가지 않기 때문이다.
    npm run build
    npm test
    npx tsc --noEmit
    npm run lint

# Go 서버를 실서비스로 올린다.
deploy-api:
    #!/usr/bin/env bash
    set -euo pipefail
    # --archive=tgz는 파일을 하나로 묶어 올린다. 파일 감시 방식으로 하나씩 올리면
    # 잘 안 맞는 환경(예: 샌드박스)에서 걸리는 경우가 있어, 처음부터 안정적인 쪽을 쓴다.
    cd api && vercel deploy --prod --yes --archive=tgz

# 화면을 실서비스로 올린다. 서버가 먼저 올라가 있는 상태를 전제로 한다(아래 deploy 참고).
deploy-web:
    #!/usr/bin/env bash
    set -euo pipefail
    cd web && vercel deploy --prod --yes --archive=tgz

# 커밋 전 전체 검증 → 서버 → 화면 순서로 실서비스에 올린다.
deploy: check deploy-api deploy-web
    #!/usr/bin/env bash
    set -euo pipefail
    # 서버를 먼저 올리는 이유: 화면은 API_ORIGIN이 가리키는 주소로 조회를 요청이 올
    # 때마다 읽는다(빌드에 굳지 않는다). 화면을 먼저 올리면 그사이 아직 없는 서버를
    # 가리키는 순간이 생긴다 — 서버를 먼저 두면 그 틈이 없다.
    #
    # push해도 자동으로 배포되지 않는다(GitHub Actions를 쓰지 않는다). Vercel 계정에
    # GitHub 로그인 연결이 없어 그 경로 자체가 없다(README "다시 올릴 때" 참고). 그래서
    # 이 레시피로 손으로 올린다.
    echo "배포 완료 — https://random-choice-gamma.vercel.app"
