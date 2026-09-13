import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { createRoomSchema, availabilityQuerySchema } from "./rooms.schema.js";
import { listRooms, createRoom, getRoomAvailability } from "./rooms.service.js";
import { ValidationError } from "../../shared/errors/AppError.js";

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
export async function getRooms(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rooms = await listRooms();
    res.status(200).json(rooms);
  } catch (err) {
    next(err);
  }
}

export async function postRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parse(createRoomSchema, req.body);
    const room = await createRoom(input);
    res.status(201).json(room);
  } catch (err) {
    next(err);
  }
}

export async function getRoomAvailabilityHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { date } = parse(availabilityQuerySchema, req.query);
    const availability = await getRoomAvailability(req.params.id as string, date);
    res.status(200).json(availability);
  } catch (err) {
    next(err);
  }
}
