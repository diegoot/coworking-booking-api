import { z } from "zod";

// Kept in sync with the Room model's constraints (see AGENTS.md).
export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  capacity: z.number().int().positive("Capacity must be a positive integer"),
  pricePerHour: z.number().positive("Price per hour must be a positive number"),
});

// Validates the `date` query param format (YYYY-MM-DD). We only check
// shape/format here — anything data-dependent (e.g. does the room
// exist) belongs in the service layer.
const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

export const availabilityQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(dateFormatRegex, "Date must be in YYYY-MM-DD format")
    // Edge case: Date.parse rolls over out-of-range days within a valid
    // month (e.g. "2026-02-30" -> 2026-03-02) instead of failing, so it
    // wouldn't catch every invalid calendar date. Improve if this needs
    // to be stricter later.
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Date must be a valid calendar date",
    }),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
