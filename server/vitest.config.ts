import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    pool: "threads",
    coverage: { provider: "v8", include: ["src/**"], exclude: ["src/index.ts"], reporter: ["text", "html"] },
  },
});
