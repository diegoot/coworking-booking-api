import "dotenv/config";
import { z } from "zod";

// Fail-fast validation of environment variables at startup.
// If any required variable is missing or malformed, the process
// should not start — better to crash immediately than at runtime
// when a request first needs a missing config value.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment variables:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
