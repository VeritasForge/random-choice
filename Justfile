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

# 개발용 데이터베이스(Postgres)를 Docker로 켠다. 접속 통계를 내 컴퓨터에서 확인할 때 쓴다(README "개발용 데이터베이스" 참고).
db:
    docker compose up -d --wait

# 개발용 데이터베이스를 끈다. 쌓인 기록은 남는다.
db-stop:
    docker compose down

# 개발용 데이터베이스를 끄고 쌓인 기록까지 지운다.
db-reset:
    docker compose down -v

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
    # api 폴더로 들어가지 않고 저장소 맨 위에서 올린다. Vercel 프로젝트에 "이
    # 프로젝트의 코드는 저장소의 api 폴더에 있다"고 지정해 두었기 때문에(main에
    # push하면 자동으로 배포되게 하려면 필요하다), api 폴더 안에서 올리면 Vercel이
    # 그 안에서 다시 api 폴더를 찾다가 실패한다.
    #
    # 연결 정보(.vercel/)는 커밋되지 않으므로 새로 내려받은 저장소에는 없다. 그
    # 상태에서 바로 vercel deploy를 돌리면 CLI가 폴더 이름으로 프로젝트를 찾다가
    # 이름이 다르면 엉뚱한 프로젝트를 새로 만들어 버린다 — web 쪽에서 실제로 이
    # 문제가 나서(2026-09-20) 두 쪽 다 이름을 못박아 명시적으로 연결한다. 서버와
    # 화면이 맨 위의 같은 .vercel/을 번갈아 쓰므로, 매번 다시 연결해야 엉뚱한
    # 프로젝트로 올라가지 않는다.
    vercel link --yes --project api > /dev/null
    # --archive=tgz는 파일을 하나로 묶어 올린다. 파일 감시 방식으로 하나씩 올리면
    # 잘 안 맞는 환경(예: 샌드박스)에서 걸리는 경우가 있어, 처음부터 안정적인 쪽을 쓴다.
    vercel deploy --prod --yes --archive=tgz

# 화면을 실서비스로 올린다. 서버가 먼저 올라가 있는 상태를 전제로 한다(아래 deploy 참고).
deploy-web:
    #!/usr/bin/env bash
    set -euo pipefail
    # web 폴더로 들어가지 않고 저장소 맨 위에서 올린다(이유는 위 deploy-api 참고).
    #
    # 실제 Vercel 프로젝트 이름은 random-choice인데 폴더 이름은 web이라 서로 다르다.
    # 연결 정보 없이 배포하면 CLI가 이름으로 프로젝트를 찾다가 못 찾고 새 프로젝트를
    # 만들어 버린다 — 2026-09-20에 실제로 이 사고가 나서(엉뚱한 프로젝트에만
    # 배포되고 진짜 서비스는 갱신되지 않음), 매번 명시적으로 연결한다.
    vercel link --yes --project random-choice > /dev/null
    vercel deploy --prod --yes --archive=tgz

# 커밋 전 전체 검증 → 서버 → 화면 순서로 실서비스에 올린다.
deploy: check deploy-api deploy-web
    #!/usr/bin/env bash
    set -euo pipefail
    # 서버를 먼저 올리는 이유: 화면은 API_ORIGIN이 가리키는 주소로 조회를 요청이 올
    # 때마다 읽는다(빌드에 굳지 않는다). 화면을 먼저 올리면 그사이 아직 없는 서버를
    # 가리키는 순간이 생긴다 — 서버를 먼저 두면 그 틈이 없다.
    #
    # main에 push하면 Vercel이 서버와 화면을 자동으로 올린다(README "다시 올릴 때"
    # 참고). 다만 자동 배포는 검증을 돌리지 않고 둘을 동시에 올린다. 검증을 거치고
    # 서버를 먼저 올려야 하는 변경은 이 레시피로 손으로 올린다.
    echo "배포 완료 — https://todaybap.vercel.app"

# 접속 통계 화면(/stats)의 비밀번호를 바꾼다. 새 비밀번호를 묻고, 그냥 Enter를 치면 무작위로 만든다.
stats-password:
    #!/usr/bin/env bash
    set -euo pipefail
    cd web
    vercel link --yes --project random-choice > /dev/null
    # 인자로 받지 않고 물어보는 이유: 인자로 넘기면 비밀번호가 셸 기록에 남는다.
    read -r -s -p "새 비밀번호 (비워 두면 무작위로 만든다): " pw
    echo
    generated=""
    if [ -z "$pw" ]; then
      pw="$(openssl rand -hex 12)"
      generated=1
    fi
    printf '%s' "$pw" | vercel env add STATS_PASSWORD --environment production --force --yes
    # 환경 변수는 새로 배포해야 적용된다. 내 컴퓨터의 코드를 올리는 대신 지금 실서비스에
    # 올라가 있는 배포를 그대로 다시 빌드한다. 그래야 비밀번호만 바뀌고, 아직 올릴
    # 생각이 없던 작업 중인 코드가 함께 올라가지 않는다.
    vercel redeploy todaybap.vercel.app
    if [ -n "$generated" ]; then
      echo "새 비밀번호: $pw"
    fi
    echo "비밀번호를 바꿨습니다 — https://todaybap.vercel.app/stats"
