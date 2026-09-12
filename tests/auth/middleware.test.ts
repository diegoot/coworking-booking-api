import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { authenticate, authorize } from "../../src/modules/auth/auth.middleware.js";
import { errorHandler } from "../../src/shared/errors/errorHandler.js";
import { env } from "../../src/shared/config/env.js";
import { prisma, uniqueEmail, deleteUserById } from "../helpers/db.js";
import type { AuthenticatedRequest } from "../../src/shared/types/auth.js";

// Minimal test-only app that wires the real authenticate/authorize
// middlewares (imported from source, not reimplemented) onto throwaway
// routes, so we can assert their behavior in isolation from any
// particular business route.
function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get("/protected", authenticate, (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    res.status(200).json({ user });
  });

  app.get("/admin-only", authenticate, authorize("ADMIN"), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(errorHandler);
  return app;
}

async function createTestUser(role: "USER" | "ADMIN" = "USER") {
  const user = await prisma.user.create({
    data: {
      name: "Middleware Test User",
      email: uniqueEmail("middleware-user"),
      password: "irrelevant-hash",
      role,
    },
  });
  return user;
}

function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

describe("authenticate middleware", () => {
  const app = buildTestApp();
  const createdUserIds: string[] = [];

  afterEach(async () => {
    while (createdUserIds.length > 0) {
      const id = createdUserIds.pop();
      if (id) {
        await deleteUserById(id);
      }
    }
  });

  it("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is malformed", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer not-a-valid-jwt");

    expect(res.status).toBe(401);
  });

  it("returns 401 when the Authorization header has no Bearer prefix", async () => {
    const res = await request(app).get("/protected").set("Authorization", "just-a-token");

    expect(res.status).toBe(401);
  });

  it("populates req.user and lets the request through with a valid token", async () => {
    const user = await createTestUser("USER");
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });

    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      email: user.email,
      role: "USER",
    });
  });

  it("returns 401 when the token belongs to a user that no longer exists", async () => {
    const user = await createTestUser("USER");
    const token = signToken({ sub: user.id, role: user.role });

    // Delete the user after issuing the token, simulating a token that
    // outlives its owner (account deleted while the token is still valid).
    await deleteUserById(user.id);

    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe("authorize middleware", () => {
  const app = buildTestApp();
  const createdUserIds: string[] = [];

  afterEach(async () => {
    while (createdUserIds.length > 0) {
      const id = createdUserIds.pop();
      if (id) {
        await deleteUserById(id);
      }
    }
  });

  it("returns 403 when the authenticated user's role is not allowed", async () => {
    const user = await createTestUser("USER");
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });

    const res = await request(app).get("/admin-only").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("lets the request through when the authenticated user's role is allowed", async () => {
    const user = await createTestUser("ADMIN");
    createdUserIds.push(user.id);
    const token = signToken({ sub: user.id, role: user.role });

    const res = await request(app).get("/admin-only").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
