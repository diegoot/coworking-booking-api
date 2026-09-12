import { PrismaClient } from "@prisma/client";

// Singleton PrismaClient instance shared across all modules.
// Creating a new PrismaClient per module/request would open
// multiple connection pools against Postgres, which is wasteful
// and can exhaust available connections.
export const prisma = new PrismaClient();
