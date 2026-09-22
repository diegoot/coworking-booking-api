import { z } from "zod";

// Shared by any query param that accepts a plain calendar date
// (YYYY-MM-DD) — currently rooms.schema.ts (availability) and
// bookings.schema.ts (listing filters).
const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

export const isoDateSchema = z
  .string()
  .trim()
  .regex(dateFormatRegex, "Date must be in YYYY-MM-DD format")
  // Edge case: Date.parse rolls over out-of-range days within a valid
  // month (e.g. "2026-02-30" -> 2026-03-02) instead of failing, so it
  // wouldn't catch every invalid calendar date. Improve if this needs
  // to be stricter later.
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Date must be a valid calendar date",
  });
