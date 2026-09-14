import "dotenv/config";
import { defineConfig } from "vitest/config";

// This file runs before any application code (including src/shared/config/env.ts,
// which validates and caches DATABASE_URL as soon as it's imported). Overriding
// DATABASE_URL here, at the earliest possible point, guarantees every test file
// and the global setup below connect to the test database instead of dev.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Add it to .env before running tests.",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

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
    // Applies the latest migrations to the test database (TEST_DATABASE_URL)
    // before the suite starts, so `npm run test` never requires a manual
    // `prisma migrate` step and never runs against an out-of-date schema.
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
