import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { BookingStatus } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { createApp } from "../../../app.js";
import { env } from "../../../shared/config/env.js";
import { prisma, uniqueEmail, deleteUserById, deleteRoomById, deleteBookingById } from "../../../shared/testing/db.js";
import { BUSINESS_TIMEZONE } from "../rooms.constants.js";

const app = createApp();

// Fixed future date used across tests so slot boundaries are deterministic.
// Each test scopes its bookings to its own fixture room, so reusing the
// same date across tests introduces no cross-test coupling.
const TEST_DATE = "2027-03-10";

// Business hours are Argentina wall-clock time; bookings in these tests
// must be expressed in that timezone (converted to their real UTC
// instant) rather than assuming the date string is already UTC.
function argentinaTime(time: string): Date {
  return fromZonedTime(`${TEST_DATE}T${time}`, BUSINESS_TIMEZONE);
}

async function createRoom() {
  return prisma.room.create({
    data: { name: `Availability Room ${randomUUID()}`, capacity: 4, pricePerHour: 10 },
  });
}

async function createBookingUser() {
  return prisma.user.create({
    data: {
      name: "Availability Test User",
      email: uniqueEmail("availability-user"),
      password: "irrelevant-hash",
      role: "USER",
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("GET /rooms/:id/availability", () => {
  const createdRoomIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdBookingIds: string[] = [];

  afterEach(async () => {
    while (createdBookingIds.length > 0) {
      const id = createdBookingIds.pop();
      if (id) {
        await deleteBookingById(id);
      }
    }
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

  async function authHeader(): Promise<string> {
    const user = await createBookingUser();
    createdUserIds.push(user.id);
    return `Bearer ${signToken({ sub: user.id, role: user.role })}`;
  }

  it("returns 401 when no Authorization header is present", async () => {
    const room = await createRoom();
    createdRoomIds.push(room.id);

    const res = await request(app).get(`/rooms/${room.id}/availability?date=${TEST_DATE}`);

    expect(res.status).toBe(401);
  });

  it("returns 404 when the room does not exist", async () => {
    const token = await authHeader();

    const res = await request(app)
      .get(`/rooms/${randomUUID()}/availability?date=${TEST_DATE}`)
      .set("Authorization", token);

    expect(res.status).toBe(404);
  });

  it("returns 422 when the date query param has an invalid format", async () => {
    const room = await createRoom();
    createdRoomIds.push(room.id);
    const token = await authHeader();

    const res = await request(app)
      .get(`/rooms/${room.id}/availability?date=03-10-2027`)
      .set("Authorization", token);

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
  });

  it("returns 422 when the date query param is missing", async () => {
    const room = await createRoom();
    createdRoomIds.push(room.id);
    const token = await authHeader();

    const res = await request(app)
      .get(`/rooms/${room.id}/availability`)
      .set("Authorization", token);

    expect(res.status).toBe(422);
  });

  it("returns all slots as free when there are no bookings", async () => {
    const room = await createRoom();
    createdRoomIds.push(room.id);
    const token = await authHeader();

    const res = await request(app)
      .get(`/rooms/${room.id}/availability?date=${TEST_DATE}`)
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeGreaterThan(0);
    expect(res.body.slots.every((slot: { status: string }) => slot.status === "free")).toBe(true);
  });

  it("marks only the overlapping slot as busy when a CONFIRMED booking exists", async () => {
    const room = await createRoom();
    createdRoomIds.push(room.id);
    const user = await createBookingUser();
    createdUserIds.push(user.id);
    const token = `Bearer ${signToken({ sub: user.id, role: user.role })}`;

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000"),
        endTime: argentinaTime("11:00:00.000"),
        status: BookingStatus.CONFIRMED,
      },
    });
    createdBookingIds.push(booking.id);

    const res = await request(app)
      .get(`/rooms/${room.id}/availability?date=${TEST_DATE}`)
      .set("Authorization", token);

    expect(res.status).toBe(200);
    const slots: Array<{ start: string; status: string }> = res.body.slots;
    const busySlots = slots.filter((slot) => slot.status === "busy");

    expect(busySlots).toHaveLength(1);
    expect(busySlots[0]?.start).toBe(argentinaTime("10:00:00.000").toISOString());

    const freeSlots = slots.filter((slot) => slot.status === "free");
    expect(freeSlots).toHaveLength(slots.length - 1);
  });

  it("does not mark a slot busy when the only booking in it is CANCELLED", async () => {
    const room = await createRoom();
    createdRoomIds.push(room.id);
    const user = await createBookingUser();
    createdUserIds.push(user.id);
    const token = `Bearer ${signToken({ sub: user.id, role: user.role })}`;

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startTime: argentinaTime("14:00:00.000"),
        endTime: argentinaTime("15:00:00.000"),
        status: BookingStatus.CANCELLED,
      },
    });
    createdBookingIds.push(booking.id);

    const res = await request(app)
      .get(`/rooms/${room.id}/availability?date=${TEST_DATE}`)
      .set("Authorization", token);

    expect(res.status).toBe(200);
    expect(res.body.slots.every((slot: { status: string }) => slot.status === "free")).toBe(true);
  });
});
