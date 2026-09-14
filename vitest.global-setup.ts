import { execSync } from "node:child_process";

// Runs once, before any test file, to make sure the test database schema
// is up to date. This removes the manual "did you migrate the test DB?"
// step: whoever runs `npm run test` always gets a freshly migrated
// `coworking_booking_test`, without touching the dev database.
//
// `DATABASE_URL` is already overridden to `TEST_DATABASE_URL` in
// vitest.config.ts by the time this runs, but we pass it explicitly here
// too so this file stays correct even if it's ever invoked on its own.
export default function globalSetup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Add it to .env before running tests.",
    );
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}
