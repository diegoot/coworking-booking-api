import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Auth integration tests hit a shared Postgres instance and each
    // test uses unique emails to stay independent from one another,
    // so running files/tests concurrently is safe and faster.
    fileParallelism: true,
  },
});
