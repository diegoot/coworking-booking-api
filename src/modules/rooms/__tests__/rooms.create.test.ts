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
      email: uniqueEmail(`rooms-${role.toLowerCase()}`),
      password: "irrelevant-hash",
      role,
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("POST /rooms", () => {
  const createdUserIds: string[] = [];
  const createdRoomIds: string[] = [];

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

  it("creates a room when the caller is an admin", async () => {
    const admin = await createTestUser("ADMIN");
    createdUserIds.push(admin.id);
    const token = signToken({ sub: admin.id, role: admin.role });

    const payload = { name: `Admin Room ${Date.now()}`, capacity: 6, pricePerHour: 15.5 };

    const res = await request(app)
      .post("/rooms")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: payload.name,
      capacity: payload.capacity,
    });
    createdRoomIds.push(res.body.id);

    const stored = await prisma.room.findUnique({ where: { id: res.body.id } });
    expect(stored).not.toBeNull();
    expect(stored?.name).toBe(payload.name);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app)
      .post("/rooms")
      .send({ name: "Unauthenticated Room", capacity: 4, pricePerHour: 10 });

    expect(res.status).toBe(401);
  });

  it("returns 403 when the authenticated user is not an admin", async () => {
    const user = await createTestUser("USER");
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });

    const res = await request(app)
      .post("/rooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Forbidden Room", capacity: 4, pricePerHour: 10 });

    expect(res.status).toBe(403);
  });

  it("returns 422 when name is missing", async () => {
    const admin = await createTestUser("ADMIN");
    createdUserIds.push(admin.id);
    const token = signToken({ sub: admin.id, role: admin.role });

    const res = await request(app)
      .post("/rooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ capacity: 4, pricePerHour: 10 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
  });

  it("returns 422 when capacity is negative", async () => {
    const admin = await createTestUser("ADMIN");
    createdUserIds.push(admin.id);
    const token = signToken({ sub: admin.id, role: admin.role });

    const res = await request(app)
      .post("/rooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Negative Capacity Room", capacity: -1, pricePerHour: 10 });

    expect(res.status).toBe(422);
  });

  it("returns 422 when pricePerHour is negative", async () => {
    const admin = await createTestUser("ADMIN");
    createdUserIds.push(admin.id);
    const token = signToken({ sub: admin.id, role: admin.role });

    const res = await request(app)
      .post("/rooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Negative Price Room", capacity: 4, pricePerHour: -10 });

    expect(res.status).toBe(422);
  });
});
