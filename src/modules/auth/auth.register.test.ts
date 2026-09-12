import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma, uniqueEmail, deleteUserByEmail } from "../../shared/testing/db.js";

const app = createApp();

describe("POST /auth/register", () => {
  const createdEmails: string[] = [];

  afterEach(async () => {
    // Each test tracks the emails it created and cleans them up itself,
    // so tests never depend on execution order or leak data across runs.
    while (createdEmails.length > 0) {
      const email = createdEmails.pop();
      if (email) {
        await deleteUserByEmail(email);
      }
    }
  });

  it("registers a new user and returns it without the password plus an access token", async () => {
    const email = uniqueEmail("register-happy");
    createdEmails.push(email);

    const res = await request(app).post("/auth/register").send({
      name: "Ada Lovelace",
      email,
      password: "supersecret123",
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      name: "Ada Lovelace",
      email,
      role: "USER",
    });
    expect(res.body.user.password).toBeUndefined();

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).not.toBeNull();
    expect(stored?.password).not.toBe("supersecret123");
  });

  it("rejects registration with a duplicate email", async () => {
    const email = uniqueEmail("register-duplicate");
    createdEmails.push(email);

    const payload = { name: "Grace Hopper", email, password: "supersecret123" };

    const first = await request(app).post("/auth/register").send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post("/auth/register").send(payload);
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/already registered/i);
  });

  it("rejects registration when a required field is missing", async () => {
    const res = await request(app).post("/auth/register").send({
      email: uniqueEmail("register-missing-name"),
      password: "supersecret123",
    });

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
  });

  it("rejects registration with an invalid email", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Invalid Email User",
      email: "not-an-email",
      password: "supersecret123",
    });

    expect(res.status).toBe(422);
  });

  it("rejects registration with a password shorter than 8 characters", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Short Password User",
      email: uniqueEmail("register-short-password"),
      password: "short1",
    });

    expect(res.status).toBe(422);
  });
});
