import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../../../app.js";
import { prisma, deleteRoomById } from "../../../shared/testing/db.js";

const app = createApp();

describe("GET /rooms/:id", () => {
  const createdRoomIds: string[] = [];

  afterEach(async () => {
    while (createdRoomIds.length > 0) {
      const id = createdRoomIds.pop();
      if (id) {
        await deleteRoomById(id);
      }
    }
  });

  it("returns the room, with no auth required", async () => {
    const room = await prisma.room.create({
      data: { name: `Fixture Room ${Date.now()}`, capacity: 4, pricePerHour: 10 },
    });
    createdRoomIds.push(room.id);

    const res = await request(app).get(`/rooms/${room.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: room.id,
        name: room.name,
        capacity: 4,
      })
    );
  });

  it("returns 404 when the room does not exist", async () => {
    const res = await request(app).get(`/rooms/${randomUUID()}`);
    expect(res.status).toBe(404);
  });
});
