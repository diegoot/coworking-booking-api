import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, Role } from "@prisma/client";

// Same cost factor as src/modules/auth/auth.service.ts — keep in sync.
const BCRYPT_SALT_ROUNDS = 12;

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error(
      "ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set (see .env.example)"
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name,
      email,
      password: passwordHash,
      role: Role.ADMIN,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Admin user ready: ${admin.email}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
