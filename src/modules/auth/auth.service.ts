import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Prisma, type Role, type User } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import { ConflictError, UnauthorizedError } from "../../shared/errors/AppError.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";

// Cost factor for bcrypt. 12 is a solid default in 2026: expensive enough
// to slow down brute-force/offline attacks on leaked hashes, cheap enough
// to not noticeably hurt login latency for a small app.
const BCRYPT_SALT_ROUNDS = 12;

// Access tokens are short-lived on purpose: if one leaks (XSS, logs,
// browser history, etc.) the exposure window is limited. This project
// doesn't implement refresh tokens yet, so 1h balances usability
// (not forcing re-login too often) against exposure risk for a practice app.
const ACCESS_TOKEN_EXPIRES_IN: SignOptions["expiresIn"] = "1h";

// Dummy hash used to run bcrypt.compare even when no user was found, so the
// "unknown email" and "wrong password" branches of loginUser take the same
// amount of time. Without this, an attacker could enumerate registered
// emails by measuring response latency: bcrypt.compare (cost 12) takes
// ~50-100ms, and skipping it for non-existent emails makes that branch
// return noticeably faster than the "wrong password" branch. The value
// being hashed is irrelevant, it's never compared against anything real —
// it only exists to pay the same bcrypt cost on every login attempt.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password-for-timing-safety", BCRYPT_SALT_ROUNDS);

export interface AuthResult {
  user: Pick<User, "id" | "name" | "email" | "role" | "createdAt">;
  accessToken: string;
}

interface AccessTokenPayload {
  sub: string;
  role: Role;
}

function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  // Fast-path check: avoids paying the bcrypt.hash cost (expensive on
  // purpose, see BCRYPT_SALT_ROUNDS) for the common case of a duplicate
  // email. This is only an optimization, not the source of truth: two
  // concurrent registrations for the same email can both pass this check
  // (TOCTOU race), so the unique constraint on User.email at the database
  // level is what actually prevents duplicates — see the try/catch below.
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new ConflictError("Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  let user: User;
  try {
    user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: passwordHash,
      },
    });
  } catch (error) {
    // P2002 = unique constraint violation. This is the real defense against
    // the race condition above: if two requests for the same email race
    // past the findUnique check concurrently, Postgres' unique index on
    // User.email lets only one INSERT succeed; the loser lands here. Without
    // this catch, PrismaClientKnownRequestError would bubble up as an
    // unhandled 500 instead of the expected 409 Conflict.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Email is already registered");
    }
    throw error;
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    accessToken,
  };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Same generic error whether the email doesn't exist or the password is
  // wrong — never reveal which one failed, that would let an attacker
  // enumerate registered emails.
  const invalidCredentialsError = new UnauthorizedError("Invalid email or password");

  // Timing side-channel mitigation: always run bcrypt.compare, even when
  // the user doesn't exist, against a precomputed dummy hash. If we
  // returned early on `!user` instead, the "unknown email" branch would
  // skip the ~50-100ms bcrypt.compare that the "wrong password" branch
  // pays, and that latency gap is measurable enough to let an attacker
  // enumerate which emails are registered — even though both branches
  // return the exact same error message and status code.
  const isPasswordValid = await bcrypt.compare(input.password, user?.password ?? DUMMY_PASSWORD_HASH);

  if (!user || !isPasswordValid) {
    throw invalidCredentialsError;
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    accessToken,
  };
}
