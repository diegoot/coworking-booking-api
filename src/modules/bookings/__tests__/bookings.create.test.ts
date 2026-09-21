import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { BookingStatus } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { createApp } from "../../../app.js";
import { env } from "../../../shared/config/env.js";
import { prisma, uniqueEmail, deleteUserById, deleteRoomById, deleteBookingById } from "../../../shared/testing/db.js";
import { BUSINESS_TIMEZONE } from "../../../shared/config/businessHours.js";

const app = createApp();

// Fixed future date used across tests so booking times are deterministic.
// Each test scopes its bookings to its own fixture room, so reusing the
// same date across tests introduces no cross-test coupling.
const TEST_DATE = "2027-04-12";

// Business hours are Argentina wall-clock time; bookings in these tests
// must be expressed in that timezone (converted to their real UTC
// instant) rather than assuming the date string is already UTC.
function argentinaTime(time: string, date = TEST_DATE): Date {
  return fromZonedTime(`${date}T${time}`, BUSINESS_TIMEZONE);
}

async function createRoom() {
  return prisma.room.create({
    data: { name: `Bookings Room ${randomUUID()}`, capacity: 4, pricePerHour: 10 },
  });
}

async function createTestUser(role: "USER" | "ADMIN" = "USER") {
  return prisma.user.create({
    data: {
      name: "Bookings Test User",
      email: uniqueEmail(`bookings-create-${role.toLowerCase()}`),
      password: "irrelevant-hash",
      role,
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("POST /bookings", () => {
  const createdBookingIds: string[] = [];
  const createdRoomIds: string[] = [];
  const createdUserIds: string[] = [];

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

  async function setupUser(role: "USER" | "ADMIN" = "USER") {
    const user = await createTestUser(role);
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });
    return { user, token };
  }

  async function setupRoom() {
    const room = await createRoom();
    createdRoomIds.push(room.id);
    return room;
  }

  it("creates a booking with CONFIRMED status by default (happy path)", async () => {
    const room = await setupRoom();
    const { token } = await setupUser();

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000").toISOString(),
        endTime: argentinaTime("11:00:00.000").toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.roomId).toBe(room.id);
    createdBookingIds.push(res.body.id);

    const stored = await prisma.booking.findUnique({ where: { id: res.body.id } });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe(BookingStatus.CONFIRMED);
  });

  it("creates a booking when startTime/endTime use an explicit offset instead of Z (e.g. -03:00)", async () => {
    const room = await setupRoom();
    const { token } = await setupUser();

    // Argentina has no DST, so -03:00 wall-clock time matches business hours
    // directly. This guards against z.string().datetime() rejecting
    // non-"Z" ISO offsets (regression: offset: true must stay enabled).
    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: `${TEST_DATE}T10:00:00-03:00`,
        endTime: `${TEST_DATE}T11:00:00-03:00`,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CONFIRMED");
    createdBookingIds.push(res.body.id);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const room = await setupRoom();

    const res = await request(app)
      .post("/bookings")
      .send({
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000").toISOString(),
        endTime: argentinaTime("11:00:00.000").toISOString(),
      });

    expect(res.status).toBe(401);
  });

  it("returns 422 when roomId is missing", async () => {
    const { token } = await setupUser();

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        startTime: argentinaTime("10:00:00.000").toISOString(),
        endTime: argentinaTime("11:00:00.000").toISOString(),
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
  });

  it("returns 422 when endTime is before startTime", async () => {
    const room = await setupRoom();
    const { token } = await setupUser();

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("11:00:00.000").toISOString(),
        endTime: argentinaTime("10:00:00.000").toISOString(),
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
  });

  it("returns 404 when the room does not exist", async () => {
    const { token } = await setupUser();

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: randomUUID(),
        startTime: argentinaTime("10:00:00.000").toISOString(),
        endTime: argentinaTime("11:00:00.000").toISOString(),
      });

    expect(res.status).toBe(404);
  });

  it("returns 422 when the booking starts before business hours (7am Argentina time)", async () => {
    const room = await setupRoom();
    const { token } = await setupUser();

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("07:00:00.000").toISOString(),
        endTime: argentinaTime("08:00:00.000").toISOString(),
      });

    expect(res.status).toBe(422);
  });

  it("returns 422 when the booking ends after business hours (9pm Argentina time)", async () => {
    const room = await setupRoom();
    const { token } = await setupUser();

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("20:00:00.000").toISOString(),
        endTime: argentinaTime("21:00:00.000").toISOString(),
      });

    expect(res.status).toBe(422);
  });

  it("returns 422 when the booking spans across midnight", async () => {
    const room = await setupRoom();
    const { token } = await setupUser();

    const nextDay = "2027-04-13";

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("19:00:00.000").toISOString(),
        endTime: argentinaTime("01:00:00.000", nextDay).toISOString(),
      });

    expect(res.status).toBe(422);
  });

  it("returns 409 when the requested range overlaps an existing (non-cancelled) booking", async () => {
    const room = await setupRoom();
    const { user, token } = await setupUser();

    const existing = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000"),
        endTime: argentinaTime("12:00:00.000"),
        status: BookingStatus.CONFIRMED,
      },
    });
    createdBookingIds.push(existing.id);

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("11:00:00.000").toISOString(),
        endTime: argentinaTime("13:00:00.000").toISOString(),
      });

    expect(res.status).toBe(409);
  });

  it("allows an adjacent (non-overlapping) booking right after an existing one", async () => {
    const room = await setupRoom();
    const { user, token } = await setupUser();

    const existing = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000"),
        endTime: argentinaTime("12:00:00.000"),
        status: BookingStatus.CONFIRMED,
      },
    });
    createdBookingIds.push(existing.id);

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("12:00:00.000").toISOString(),
        endTime: argentinaTime("13:00:00.000").toISOString(),
      });

    expect(res.status).toBe(201);
    createdBookingIds.push(res.body.id);
  });

  it("allows a booking for a fully separate (non-overlapping) time range", async () => {
    const room = await setupRoom();
    const { user, token } = await setupUser();

    const existing = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000"),
        endTime: argentinaTime("11:00:00.000"),
        status: BookingStatus.CONFIRMED,
      },
    });
    createdBookingIds.push(existing.id);

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("15:00:00.000").toISOString(),
        endTime: argentinaTime("16:00:00.000").toISOString(),
      });

    expect(res.status).toBe(201);
    createdBookingIds.push(res.body.id);
  });

  it("does not consider a CANCELLED booking as an overlap", async () => {
    const room = await setupRoom();
    const { user, token } = await setupUser();

    const existing = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000"),
        endTime: argentinaTime("12:00:00.000"),
        status: BookingStatus.CANCELLED,
      },
    });
    createdBookingIds.push(existing.id);

    const res = await request(app)
      .post("/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        roomId: room.id,
        startTime: argentinaTime("10:00:00.000").toISOString(),
        endTime: argentinaTime("12:00:00.000").toISOString(),
      });

    expect(res.status).toBe(201);
    createdBookingIds.push(res.body.id);
  });
});
