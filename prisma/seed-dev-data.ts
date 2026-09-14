import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, Role, BookingStatus } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";

// Standalone, local-dev-only sample data seed. Intentionally NOT wired to
// Prisma's `"prisma": { "seed": ... }` hook (see package.json) — that hook
// only runs prisma/seed.ts (the production-safe admin seed) and is
// triggered automatically by `prisma migrate dev`. This script must only
// ever be run by hand via `npm run prisma:seed:dev`, so there is no risk
// of sample data leaking into a real environment.
//
// Same bcrypt cost factor as src/modules/auth/auth.service.ts — keep in sync.
const BCRYPT_SALT_ROUNDS = 12;

// Same timezone the booking business rules are anchored to (see
// src/shared/config/businessHours.ts). All sample bookings below use
// wall-clock hours in this timezone, converted to UTC instants the same
// way src/shared/utils/businessHours.ts does.
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

const SAMPLE_PASSWORD = "password123";

const SAMPLE_USERS = [
  { name: "Sample User One", email: "user1@example.com" },
  { name: "Sample User Two", email: "user2@example.com" },
  { name: "Sample User Three", email: "user3@example.com" },
] as const;

const SAMPLE_ROOMS = [
  { name: "Sala A", capacity: 4, pricePerHour: 10 },
  { name: "Sala B", capacity: 8, pricePerHour: 18 },
  { name: "Sala C", capacity: 2, pricePerHour: 6 },
] as const;

const prisma = new PrismaClient();

// Local wall-clock time in BUSINESS_TIMEZONE -> UTC Date instant.
function atBusinessTime(daysFromNow: number, hour: number): Date {
  const day = new Date();
  day.setDate(day.getDate() + daysFromNow);
  const isoDate = day.toISOString().slice(0, 10);
  return fromZonedTime(`${isoDate}T${String(hour).padStart(2, "0")}:00:00.000`, BUSINESS_TIMEZONE);
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, BCRYPT_SALT_ROUNDS);

  const users = [];
  for (const { name, email } of SAMPLE_USERS) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        password: passwordHash,
        role: Role.USER,
      },
    });
    users.push(user);
  }
  return users;
}

async function seedRooms() {
  const rooms = [];
  for (const { name, capacity, pricePerHour } of SAMPLE_ROOMS) {
    let room = await prisma.room.findFirst({ where: { name } });
    if (!room) {
      room = await prisma.room.create({
        data: { name, capacity, pricePerHour },
      });
    }
    rooms.push(room);
  }
  return rooms;
}

async function upsertBooking(
  userId: string,
  roomId: string,
  startTime: Date,
  endTime: Date,
  status: BookingStatus
) {
  const existing = await prisma.booking.findFirst({
    where: { userId, roomId, startTime },
  });
  if (existing) {
    return existing;
  }
  return prisma.booking.create({
    data: { userId, roomId, startTime, endTime, status },
  });
}

async function seedBookings(
  users: Awaited<ReturnType<typeof seedUsers>>,
  rooms: Awaited<ReturnType<typeof seedRooms>>
) {
  const [userOne, userTwo, userThree] = users;
  const [roomA, roomB, roomC] = rooms;

  // Non-overlapping slots per room, spread over the next few days.
  const bookings = [
    // Room A
    { user: userOne, room: roomA, day: 1, startHour: 9, endHour: 10, status: BookingStatus.CONFIRMED },
    { user: userTwo, room: roomA, day: 1, startHour: 11, endHour: 12, status: BookingStatus.PENDING },
    // Room B
    { user: userTwo, room: roomB, day: 2, startHour: 14, endHour: 16, status: BookingStatus.CONFIRMED },
    { user: userThree, room: roomB, day: 3, startHour: 9, endHour: 10, status: BookingStatus.PENDING },
    // Room C
    { user: userThree, room: roomC, day: 2, startHour: 10, endHour: 11, status: BookingStatus.CONFIRMED },
    { user: userOne, room: roomC, day: 4, startHour: 15, endHour: 17, status: BookingStatus.PENDING },
  ];

  const created = [];
  for (const { user, room, day, startHour, endHour, status } of bookings) {
    const booking = await upsertBooking(
      user.id,
      room.id,
      atBusinessTime(day, startHour),
      atBusinessTime(day, endHour),
      status
    );
    created.push(booking);
  }
  return created;
}

async function main() {
  const users = await seedUsers();
  const rooms = await seedRooms();
  const bookings = await seedBookings(users, rooms);

  // eslint-disable-next-line no-console
  console.log("Sample dev data ready:");
  // eslint-disable-next-line no-console
  console.log(`  Users (${users.length}), password "${SAMPLE_PASSWORD}" for all:`);
  for (const user of users) {
    // eslint-disable-next-line no-console
    console.log(`    - ${user.email}`);
  }
  // eslint-disable-next-line no-console
  console.log(`  Rooms (${rooms.length}):`);
  for (const room of rooms) {
    // eslint-disable-next-line no-console
    console.log(`    - ${room.name} (capacity ${room.capacity}, $${room.pricePerHour}/h)`);
  }
  // eslint-disable-next-line no-console
  console.log(`  Bookings (${bookings.length}):`);
  for (const booking of bookings) {
    // eslint-disable-next-line no-console
    console.log(
      `    - ${booking.startTime.toISOString()} -> ${booking.endTime.toISOString()} [${booking.status}]`
    );
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
