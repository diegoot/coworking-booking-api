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
      email: uniqueEmail(`bookings-byuserid-${role.toLowerCase()}`),
      password: "irrelevant-hash",
      role,
    },
  });
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("GET /bookings/:userId", () => {
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

  it("allows an admin to view bookings for any user", async () => {
    const room = await setupRoom();
    const { user: targetUser } = await setupUser();
    const { token: adminToken } = await setupUser("ADMIN");

    const booking = await prisma.booking.create({
      data: {
        userId: targetUser.id,
        roomId: room.id,
        startTime: argentinaTime("09:00:00.000"),
        endTime: argentinaTime("10:00:00.000"),
      },
    });
    createdBookingIds.push(booking.id);

    const res = await request(app)
      .get(`/bookings/${targetUser.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(booking.id);
  });

  it("returns 403 for a regular user, even when requesting their own userId", async () => {
    const { user, token } = await setupUser();

    const res = await request(app).get(`/bookings/${user.id}`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get(`/bookings/${randomUUID()}`);
    expect(res.status).toBe(401);
  });
});
