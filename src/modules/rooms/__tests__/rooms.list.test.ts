import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../../app.js";
import { env } from "../../../shared/config/env.js";
import { prisma, uniqueEmail, deleteUserById, deleteRoomById } from "../../../shared/testing/db.js";

const app = createApp();

async function createTestUser(role: "USER" | "ADMIN") {
  return prisma.user.create({
    data: {
      name: "Rooms Test User",
      email: uniqueEmail(`rooms-list-${role.toLowerCase()}`),
      password: "irrelevant-hash",
      role,
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("GET /rooms", () => {
  const createdRoomIds: string[] = [];
  const createdUserIds: string[] = [];

  afterEach(async () => {
    while (createdRoomIds.length > 0) {
      const id = createdRoomIds.pop();
      if (id) {
        await deleteRoomById(id);
      }
    }
    while (createdUserIds.length > 0) {
      const id = createdUserIds.pop();
      if (id) {
        await deleteUserById(id);
      }
    }
  });

  it("returns an array containing a previously created room", async () => {
    const room = await prisma.room.create({
      data: { name: `Fixture Room ${Date.now()}`, capacity: 4, pricePerHour: 10 },
    });
    createdRoomIds.push(room.id);
    const user = await createTestUser("USER");
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });

    const res = await request(app).get("/rooms").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: room.id,
          name: room.name,
          capacity: 4,
        }),
      ])
    );
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/rooms");
    expect(res.status).toBe(401);
  });
});
