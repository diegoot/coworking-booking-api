import { z } from "zod";
import { isoDateSchema } from "../../shared/schemas/isoDate.js";

// Kept in sync with the Room model's constraints (see AGENTS.md).
export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  capacity: z.number().int().positive("Capacity must be a positive integer"),
  pricePerHour: z.number().positive("Price per hour must be a positive number"),
});

// Only checks shape/format here — anything data-dependent (e.g. does the
// room exist) belongs in the service layer.
export const availabilityQuerySchema = z.object({
  date: isoDateSchema,
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
