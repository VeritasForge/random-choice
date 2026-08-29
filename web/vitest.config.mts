import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib 아래는 DOM을 만지지 않는다. 브라우저 API를 쓰는 곳(geo.ts의 navigator,
    // api.ts의 fetch)은 시험에서 전역을 갈아 끼우고, node가 fetch·Response를
    // 이미 갖고 있으므로 node 환경으로 충분하다.
    environment: "node",
    // 여기 적힌 경로 밖의 시험 파일은 경고 없이 그냥 실행되지 않는다.
    // 예전에는 lib만 적혀 있어서, components/ 아래에 일부러 실패하도록 만든 시험을
    // 넣어도 "전부 통과"로 초록불이 떴다. 화면 조각 시험을 나중에 추가하더라도
    // 최소한 조용히 무시되지는 않도록 대상 경로를 넓혀 둔다.
    // (.tsx 시험을 실제로 돌리려면 jsdom과 @testing-library/react가 필요하다.
    //  아직 설치하지 않았으므로, 그런 파일을 추가하면 조용히 통과하는 대신
    //  환경이 없다고 시끄럽게 실패한다 — 그게 지금보다 낫다.)
    include: ["{lib,app,components}/**/*.test.{ts,tsx}"],
  },
});
