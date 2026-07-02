import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // 시간 포맷 테스트가 로컬 시간대에 의존하므로 KST 로 고정 (CI/UTC 환경 대비)
    env: { TZ: "Asia/Seoul" },
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", "out", ".next", "src-tauri", "android", "ios"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
