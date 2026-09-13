import { BookingStatus, type Booking } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/AppError.js";
import { isWithinBusinessHours } from "../../shared/utils/businessHours.js";
import type { AuthUser } from "../../shared/types/auth.js";
import type { CreateBookingInput } from "./bookings.schema.js";

// Used both by GET /bookings/me (userId = req.user.id) and by
// GET /bookings/:userId (admin only, userId = the requested user). The
// query itself doesn't need to know which route called it — the
// authorization difference is handled entirely in the routes/middleware
// layer (authenticate vs authenticate + authorize("ADMIN")).
export async function listBookingsForUser(userId: string): Promise<Booking[]> {
  return prisma.booking.findMany({
    where: { userId },
    orderBy: { startTime: "asc" },
  });
}

export async function createBooking(userId: string, input: CreateBookingInput): Promise<Booking> {
  const room = await prisma.room.findUnique({ where: { id: input.roomId } });

  if (!room) {
    throw new NotFoundError("Room not found");
  }

  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);

  // Business rule 1 (AGENTS.md): a booking must fall within a single
  // calendar day and within 8:00-20:00 Argentina time. Shape validation
  // (endTime > startTime) already happened in the Zod schema; this is a
  // data-dependent rule, so it lives here, not in Zod.
  if (!isWithinBusinessHours(startTime, endTime)) {
    throw new ValidationError(
      "Booking must be within business hours (08:00-20:00, Argentina time) and cannot span multiple days"
    );
  }

  // Business rule 2 (AGENTS.md): reject overlapping bookings for the
  // same room. A CANCELLED booking no longer occupies the room's
  // schedule, so it's excluded from the conflict check — same criterion
  // already used by rooms.service.getRoomAvailability.
  const overlapping = await prisma.booking.findFirst({
    where: {
      roomId: input.roomId,
      status: { not: BookingStatus.CANCELLED },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });

  if (overlapping) {
    throw new ConflictError("This room is already booked for the requested time range");
  }

  // `status` is intentionally omitted: it must keep the Prisma schema's
  // PENDING default rather than being set explicitly here.
  return prisma.booking.create({
    data: {
      userId,
      roomId: input.roomId,
      startTime,
      endTime,
    },
  });
}

// Soft delete: cancellation must always preserve history (the Booking ->
// User/Room relations use onDelete: Restrict for the same reason), so
// this updates `status` to CANCELLED instead of removing the row.
export async function cancelBooking(bookingId: string, requester: AuthUser): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking) {
    throw new NotFoundError("Booking not found");
  }

  const isOwner = booking.userId === requester.id;
  const isAdmin = requester.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError("You do not have permission to cancel this booking");
  }

  if (booking.status === BookingStatus.CANCELLED) {
    // Not idempotent by design: cancelling an already-cancelled booking
    // is a genuine error, not a no-op (mirrors how Stripe treats
    // cancelling an already-cancelled subscription).
    throw new ConflictError("This booking is already cancelled");
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: BookingStatus.CANCELLED },
  });
}
