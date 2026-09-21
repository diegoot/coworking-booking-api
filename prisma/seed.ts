import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, Role, BookingStatus } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";

// Same cost factor as src/modules/auth/auth.service.ts — keep in sync.
const BCRYPT_SALT_ROUNDS = 12;

// Same timezone the booking business rules are anchored to (see
// src/shared/config/businessHours.ts).
const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

const SAMPLE_PASSWORD = "password123";

const SAMPLE_USERS = [
  { name: "Sample User One", email: "user1@example.com" },
  { name: "Sample User Two", email: "user2@example.com" },
  { name: "Sample User Three", email: "user3@example.com" },
] as const;

const SAMPLE_ROOMS = [
  { name: "Room A", capacity: 4, pricePerHour: 10 },
  { name: "Room B", capacity: 8, pricePerHour: 18 },
  { name: "Room C", capacity: 2, pricePerHour: 6 },
] as const;

const prisma = new PrismaClient();

// Local wall-clock time in BUSINESS_TIMEZONE -> UTC Date instant.
function atBusinessTime(daysFromNow: number, hour: number): Date {
  const day = new Date();
  day.setDate(day.getDate() + daysFromNow);
  const isoDate = day.toISOString().slice(0, 10);
  return fromZonedTime(`${isoDate}T${String(hour).padStart(2, "0")}:00:00.000`, BUSINESS_TIMEZONE);
}

// Wipes every table this seed owns, so each run leaves a clean, predictable
// state instead of accumulating stale rows across runs/deploys. This script
// runs on every deploy (see package.json's build command), which is fine
// for this portfolio's throwaway demo DB — see the "Data resets
// periodically" note in the README.
async function wipe() {
  await prisma.booking.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.user.deleteMany({});
}

async function seedAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error(
      "ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set (see .env.example)"
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  return prisma.user.create({
    data: { name, email, password: passwordHash, role: Role.ADMIN },
  });
}

async function seedSampleUsers() {
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, BCRYPT_SALT_ROUNDS);

  const users = [];
  for (const { name, email } of SAMPLE_USERS) {
    const user = await prisma.user.create({
      data: { name, email, password: passwordHash, role: Role.USER },
    });
    users.push(user);
  }
  return users;
}

async function seedRooms() {
  const rooms = [];
  for (const { name, capacity, pricePerHour } of SAMPLE_ROOMS) {
    const room = await prisma.room.create({ data: { name, capacity, pricePerHour } });
    rooms.push(room);
  }
  return rooms;
}

async function seedBookings(
  users: Awaited<ReturnType<typeof seedSampleUsers>>,
  rooms: Awaited<ReturnType<typeof seedRooms>>
) {
  const [userOne, userTwo, userThree] = users;
  const [roomA, roomB, roomC] = rooms;

  // Non-overlapping slots per room, spread over the next few days.
  const bookings = [
    { user: userOne, room: roomA, day: 1, startHour: 9, endHour: 10, status: BookingStatus.CONFIRMED },
    { user: userTwo, room: roomA, day: 1, startHour: 11, endHour: 12, status: BookingStatus.CANCELLED },
    { user: userTwo, room: roomB, day: 2, startHour: 14, endHour: 16, status: BookingStatus.CONFIRMED },
    { user: userThree, room: roomB, day: 3, startHour: 9, endHour: 10, status: BookingStatus.CANCELLED },
    { user: userThree, room: roomC, day: 2, startHour: 10, endHour: 11, status: BookingStatus.CONFIRMED },
    { user: userOne, room: roomC, day: 4, startHour: 15, endHour: 17, status: BookingStatus.CONFIRMED },
  ];

  const created = [];
  for (const { user, room, day, startHour, endHour, status } of bookings) {
    created.push(
      await prisma.booking.create({
        data: {
          userId: user.id,
          roomId: room.id,
          startTime: atBusinessTime(day, startHour),
          endTime: atBusinessTime(day, endHour),
          status,
        },
      })
    );
  }
  return created;
}

async function main() {
  await wipe();

  const admin = await seedAdmin();
  const users = await seedSampleUsers();
  const rooms = await seedRooms();
  const bookings = await seedBookings(users, rooms);

  // eslint-disable-next-line no-console
  console.log(`Admin user ready: ${admin.email}`);
  // eslint-disable-next-line no-console
  console.log(`Sample users (${users.length}), password "${SAMPLE_PASSWORD}" for all:`);
  for (const user of users) {
    // eslint-disable-next-line no-console
    console.log(`  - ${user.email}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Rooms (${rooms.length}):`);
  for (const room of rooms) {
    // eslint-disable-next-line no-console
    console.log(`  - ${room.name} (capacity ${room.capacity}, $${room.pricePerHour}/h)`);
  }
  // eslint-disable-next-line no-console
  console.log(`Bookings (${bookings.length}):`);
  for (const booking of bookings) {
    // eslint-disable-next-line no-console
    console.log(
      `  - ${booking.startTime.toISOString()} -> ${booking.endTime.toISOString()} [${booking.status}]`
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
