import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { registerSchema, loginSchema } from "./auth.schema.js";
import { registerUser, loginUser } from "./auth.service.js";
import { ValidationError } from "../../shared/errors/AppError.js";

// Parses the request body against the given schema, translating Zod
// failures into our own ValidationError so the centralized error handler
// produces a consistent response shape across the whole API.
function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new ValidationError("Invalid request body", result.error.flatten());
  }

  return result.data;
}

// Controllers only orchestrate: validate input, delegate to the service,
// shape the HTTP response. No business logic here.
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = parseBody(registerSchema, req.body);
    const result = await registerUser(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = parseBody(loginSchema, req.body);
    const result = await loginUser(input);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
