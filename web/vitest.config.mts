import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib 아래의 함수들은 브라우저 없이 도는 순수 계산이라 node로 충분하다.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
