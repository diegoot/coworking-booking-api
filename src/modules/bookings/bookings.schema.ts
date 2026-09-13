import { z } from "zod";

// Only shape/format is validated here (valid UUID room id, valid ISO
// datetimes, endTime strictly after startTime). Anything data-dependent
// — the room existing, business-hours containment, overlap with other
// bookings — is not a shape concern and belongs in the service layer.
export const createBookingSchema = z
  .object({
    roomId: z.string().uuid("roomId must be a valid UUID"),
    startTime: z.string().datetime({ offset: true, message: "startTime must be a valid ISO datetime" }),
    endTime: z.string().datetime({ offset: true, message: "endTime must be a valid ISO datetime" }),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
