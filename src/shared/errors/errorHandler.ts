import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "./AppError.js";

interface ErrorResponseBody {
  error: {
    message: string;
    details?: unknown;
    stack?: string;
  };
}

// Centralized error-handling middleware. Must be mounted last, after
// all routes. Express recognizes it as an error handler because it
// takes 4 arguments.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Operational errors: expected, already have a status code and a
  // safe-to-expose message.
  if (err instanceof AppError) {
    const body: ErrorResponseBody = {
      error: {
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Programming/unexpected errors: never trust their message/stack to
  // be safe for clients. Log full detail server-side, return a
  // generic message to the client, and only leak the stack outside
  // of production for debugging purposes.
  // eslint-disable-next-line no-console
  console.error(err);

  const message = "Internal server error";
  const body: ErrorResponseBody = {
    error: {
      message,
      ...(env.NODE_ENV !== "production" && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  };

  res.status(500).json(body);
}
