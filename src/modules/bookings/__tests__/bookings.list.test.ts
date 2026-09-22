import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { createApp } from "../../../app.js";
import { env } from "../../../shared/config/env.js";
import { prisma, uniqueEmail, deleteUserById, deleteRoomById, deleteBookingById } from "../../../shared/testing/db.js";
import { BUSINESS_TIMEZONE } from "../../../shared/config/businessHours.js";

const app = createApp();

// Fixed future date used across tests so booking times are deterministic.
// Each test scopes its bookings to its own fixture room/user, so reusing
// the same date across tests introduces no cross-test coupling.
const TEST_DATE = "2027-04-12";
const OTHER_DATE = "2027-04-13";

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
      email: uniqueEmail(`bookings-list-${role.toLowerCase()}`),
      password: "irrelevant-hash",
      role,
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("GET /bookings", () => {
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

  async function createFixtureBooking(userId: string, roomId: string, date = TEST_DATE) {
    const booking = await prisma.booking.create({
      data: {
        userId,
        roomId,
        startTime: argentinaTime("09:00:00.000", date),
        endTime: argentinaTime("10:00:00.000", date),
      },
    });
    createdBookingIds.push(booking.id);
    return booking;
  }

  it("returns every booking when no filters are given", async () => {
    const room = await setupRoom();
    const { user } = await setupUser();
    const { token: adminToken } = await setupUser("ADMIN");
    const booking = await createFixtureBooking(user.id, room.id);

    const res = await request(app).get("/bookings").set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(booking.id);
  });

  it("filters by roomId", async () => {
    const roomA = await setupRoom();
    const roomB = await setupRoom();
    const { user } = await setupUser();
    const { token: adminToken } = await setupUser("ADMIN");
    const bookingA = await createFixtureBooking(user.id, roomA.id);
    const bookingB = await prisma.booking.create({
      data: {
        userId: user.id,
        roomId: roomB.id,
        startTime: argentinaTime("11:00:00.000"),
        endTime: argentinaTime("12:00:00.000"),
      },
    });
    createdBookingIds.push(bookingB.id);

    const res = await request(app)
      .get(`/bookings?roomId=${roomA.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookingA.id);
    expect(ids).not.toContain(bookingB.id);
  });

  it("filters by userId", async () => {
    const room = await setupRoom();
    const { user: userOne } = await setupUser();
    const { user: userTwo } = await setupUser();
    const { token: adminToken } = await setupUser("ADMIN");
    const bookingOne = await createFixtureBooking(userOne.id, room.id);
    const bookingTwo = await prisma.booking.create({
      data: {
        userId: userTwo.id,
        roomId: room.id,
        startTime: argentinaTime("11:00:00.000"),
        endTime: argentinaTime("12:00:00.000"),
      },
    });
    createdBookingIds.push(bookingTwo.id);

    const res = await request(app)
      .get(`/bookings?userId=${userOne.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookingOne.id);
    expect(ids).not.toContain(bookingTwo.id);
  });

  it("filters by date", async () => {
    const room = await setupRoom();
    const { user } = await setupUser();
    const { token: adminToken } = await setupUser("ADMIN");
    const bookingOnDate = await createFixtureBooking(user.id, room.id, TEST_DATE);
    const bookingOtherDate = await createFixtureBooking(user.id, room.id, OTHER_DATE);

    const res = await request(app)
      .get(`/bookings?date=${TEST_DATE}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookingOnDate.id);
    expect(ids).not.toContain(bookingOtherDate.id);
  });

  it("combines multiple filters (AND, not OR)", async () => {
    const roomA = await setupRoom();
    const roomB = await setupRoom();
    const { user } = await setupUser();
    const { token: adminToken } = await setupUser("ADMIN");
    const matching = await createFixtureBooking(user.id, roomA.id, TEST_DATE);
    // Same user and date, different room — must be excluded when
    // filtering by roomId=roomA.
    const wrongRoom = await createFixtureBooking(user.id, roomB.id, TEST_DATE);

    const res = await request(app)
      .get(`/bookings?roomId=${roomA.id}&userId=${user.id}&date=${TEST_DATE}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(matching.id);
    expect(ids).not.toContain(wrongRoom.id);
  });

  it("returns 422 when date has an invalid format", async () => {
    const { token: adminToken } = await setupUser("ADMIN");

    const res = await request(app)
      .get("/bookings?date=12-04-2027")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
  });

  it("returns 422 when roomId is not a valid UUID", async () => {
    const { token: adminToken } = await setupUser("ADMIN");

    const res = await request(app)
      .get("/bookings?roomId=not-a-uuid")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
  });

  it("returns 403 for a regular user", async () => {
    const { token } = await setupUser();

    const res = await request(app).get("/bookings").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/bookings");
    expect(res.status).toBe(401);
  });
});
