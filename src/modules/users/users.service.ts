import type { Role } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";

// Explicit select instead of returning the raw User row: password must
// never leave the service layer, not even to be stripped downstream.
const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
};

export async function listUsers(): Promise<PublicUser[]> {
  return prisma.user.findMany({
    select: PUBLIC_USER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}
