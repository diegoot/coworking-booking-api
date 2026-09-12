import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../../shared/config/env.js";
import { prisma } from "../../shared/db/prisma.js";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/AppError.js";
import type { AuthenticatedRequest } from "../../shared/types/auth.js";

interface AccessTokenPayload {
  sub: string;
  role: Role;
}

function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).sub === "string"
  );
}

// Verifies the JWT sent in the Authorization header and attaches the
// authenticated user to `req.user`. Always returns a generic 401 on any
// failure (missing header, malformed token, expired token, invalid
// signature, user no longer exists) — never reveal which specific check
// failed, that would leak information useful to an attacker.
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authentication required");
    }

    const token = authHeader.slice("Bearer ".length).trim();

    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (!isAccessTokenPayload(decoded)) {
      throw new UnauthorizedError("Authentication required");
    }

    // Look up the user on every request instead of trusting the token's
    // embedded role: if a user is deleted or their role changes, that
    // takes effect immediately instead of only after the (short-lived)
    // token expires.
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch {
    // Any failure (JsonWebTokenError, TokenExpiredError, DB lookup, etc.)
    // collapses to the same generic, non-revealing 401.
    next(new UnauthorizedError("Authentication required"));
  }
}

// Role-based authorization middleware. Must run after `authenticate`.
// Checking role is only "is this user in the right category" — it does
// NOT verify ownership of a specific resource (e.g. "is this booking
// theirs"). Ownership checks belong in the relevant module's own logic.
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      next(new UnauthorizedError("Authentication required"));
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(new ForbiddenError("You do not have permission to perform this action"));
      return;
    }

    next();
  };
}
