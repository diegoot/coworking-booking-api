import { randomUUID } from "node:crypto";
import { prisma } from "../../src/shared/db/prisma.js";

// Re-exported so tests needing direct Prisma access (e.g. creating a user
// by hand to test middleware) import it from this helper instead of a
// separate import to src/shared/db/prisma.js.
export { prisma };

// Generates a unique email per test invocation so tests never collide on
// the `email` unique constraint, regardless of execution order or
// parallelism, and so tests don't need to share fixture data.
export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@example.test`;
}

// Deletes a user by id, ignoring the case where it's already gone
// (e.g. a test that deliberately deletes the user itself). Keeps
// cleanup in `afterEach`/`afterAll` blocks resilient and one-line.
export async function deleteUserById(id: string): Promise<void> {
  await prisma.user.deleteMany({ where: { id } });
}

export async function deleteUserByEmail(email: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email } });
}
