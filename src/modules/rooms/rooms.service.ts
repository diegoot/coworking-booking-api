import { BookingStatus, type Room } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "../../shared/db/prisma.js";
import { NotFoundError } from "../../shared/errors/AppError.js";
import { BUSINESS_HOURS_START, BUSINESS_HOURS_END, BUSINESS_TIMEZONE } from "../../shared/config/businessHours.js";
import { SLOT_DURATION_HOURS } from "./rooms.constants.js";
import type { CreateRoomInput } from "./rooms.schema.js";

export interface AvailabilitySlot {
  start: string;
  end: string;
  status: "free" | "busy";
}

export interface RoomAvailability {
  roomId: string;
  date: string;
  slots: AvailabilitySlot[];
}

export async function listRooms(): Promise<Room[]> {
  return prisma.room.findMany({ orderBy: { createdAt: "asc" } });
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  return prisma.room.create({ data: input });
}

// POST /bookings (see modules/bookings) validates that startTime/endTime
// fall within 8:00-20:00 and never cross midnight (business rule 1 in
// AGENTS.md), via shared/utils/businessHours.ts. getRoomAvailability
// below relies on that invariant already holding for every stored
// booking; if it's ever violated, the day-containment query here would
// need to go back to a generic overlap check.
export async function getRoomAvailability(
  roomId: string,
  date: string
): Promise<RoomAvailability> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });

  if (!room) {
    throw new NotFoundError("Room not found");
  }

  // Day boundaries expressed as wall-clock time in the business timezone
  // (Argentina), then converted to their real UTC instants. The server may
  // run in any timezone, so we must never assume the date string is UTC.
  const dayStart = fromZonedTime(`${date}T00:00:00.000`, BUSINESS_TIMEZONE);
  const dayEnd = fromZonedTime(`${date}T23:59:59.999`, BUSINESS_TIMEZONE);

  const bookings = await prisma.booking.findMany({
    where: {
      roomId,
      // Exact containment within the day, not a generic overlap check.
      // This is safe because of business rule 1 in AGENTS.md: a booking
      // never spans midnight and always falls within business hours
      // (8:00-20:00), so any booking for this room is either fully inside
      // [dayStart, dayEnd] or fully outside it. The overlap check
      // (startTime < end AND endTime > start) is business rule 2 in
      // AGENTS.md and is the right logic for detecting conflicts between
      // two bookings when creating one — see bookings service.
      startTime: { gte: dayStart },
      endTime: { lte: dayEnd },
      // A cancelled booking never occupied the room's schedule going
      // forward — the slot it used to hold should be reported as free
      // again, so we exclude CANCELLED bookings from the occupancy check.
      status: { not: BookingStatus.CANCELLED },
    },
    select: { startTime: true, endTime: true },
  });

  const slots: AvailabilitySlot[] = [];

  for (
    let hour = BUSINESS_HOURS_START;
    hour < BUSINESS_HOURS_END;
    hour += SLOT_DURATION_HOURS
  ) {
    // Business hours (8, 9, ... 19) are wall-clock hours in Argentina,
    // converted to their real UTC instants — not raw UTC hours.
    const slotStartHour = String(hour).padStart(2, "0");
    const slotEndHour = String(hour + SLOT_DURATION_HOURS).padStart(2, "0");

    const slotStart = fromZonedTime(`${date}T${slotStartHour}:00:00.000`, BUSINESS_TIMEZONE);
    const slotEnd = fromZonedTime(`${date}T${slotEndHour}:00:00.000`, BUSINESS_TIMEZONE);

    // Applying business rule 2 from AGENTS.md (the overlap formula) to
    // check this slot against each fetched booking.
    const isBusy = bookings.some(
      (booking) => slotStart < booking.endTime && slotEnd > booking.startTime
    );

    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      status: isBusy ? "busy" : "free",
    });
  }

  return { roomId, date, slots };
}
