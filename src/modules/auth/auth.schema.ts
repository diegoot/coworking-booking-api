import { z } from "zod";

// Kept in sync with the User model's constraints (see AGENTS.md).
// Password minimum length is a basic strength floor, not a full policy —
// good enough for a practice project without pulling in extra complexity.
export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(72, "Password must be at most 72 characters long"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(72, "Password must be at most 72 characters long"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
