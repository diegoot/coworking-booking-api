import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { createBookingSchema, listBookingsQuerySchema } from "./bookings.schema.js";
import { cancelBooking, createBooking, listBookings, listBookingsForUser } from "./bookings.service.js";
import { ValidationError } from "../../shared/errors/AppError.js";
import type { AuthenticatedRequest } from "../../shared/types/auth.js";

// Parses arbitrary input against the given schema, translating Zod
// failures into our own ValidationError so the centralized error handler
// produces a consistent response shape across the whole API.
function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError("Invalid request", result.error.flatten());
  }

  return result.data;
}

// Controllers only orchestrate: validate input, delegate to the service,
// shape the HTTP response. No business logic here.
export async function getMyBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const bookings = await listBookingsForUser(user.id);
    res.status(200).json(bookings);
  } catch (err) {
    next(err);
  }
}

export async function getBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = parse(listBookingsQuerySchema, req.query);
    const bookings = await listBookings(filters);
    res.status(200).json(bookings);
  } catch (err) {
    next(err);
  }
}

export async function postBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input = parse(createBookingSchema, req.body);
    const booking = await createBooking(user.id, input);
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

export async function deleteBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const booking = await cancelBooking(req.params.id as string, user);
    res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
}
