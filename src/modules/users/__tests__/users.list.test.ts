import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../../app.js";
import { env } from "../../../shared/config/env.js";
import { prisma, uniqueEmail, deleteUserById } from "../../../shared/testing/db.js";

const app = createApp();

async function createTestUser(role: "USER" | "ADMIN") {
  return prisma.user.create({
    data: {
      name: "Users Test User",
      email: uniqueEmail(`users-list-${role.toLowerCase()}`),
      password: "irrelevant-hash",
      role,
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("GET /users", () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    while (createdUserIds.length > 0) {
      const id = createdUserIds.pop();
      if (id) {
        await deleteUserById(id);
      }
    }
  });

  it("returns an array of users, without the password field, when the caller is an admin", async () => {
    const admin = await createTestUser("ADMIN");
    createdUserIds.push(admin.id);
    const other = await createTestUser("USER");
    createdUserIds.push(other.id);
    const token = signToken({ sub: admin.id, role: admin.role });

    const res = await request(app).get("/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: other.id,
          name: other.name,
          email: other.email,
          role: other.role,
        }),
      ])
    );
    for (const user of res.body) {
      expect(user.password).toBeUndefined();
    }
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the authenticated user is not an admin", async () => {
    const user = await createTestUser("USER");
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });

    const res = await request(app).get("/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
