import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { uniqueEmail, deleteUserByEmail } from "../../../shared/testing/db.js";

const app = createApp();

describe("POST /auth/login", () => {
  const email = uniqueEmail("login-user");
  const password = "correct-password-123";

  // A single registered user is shared read-only across the tests in this
  // file (nothing mutates it), so we set it up once instead of per-test.
  beforeAll(async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Login Test User",
      email,
      password,
    });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    await deleteUserByEmail(email);
  });

  it("logs in with correct credentials and returns an access token", async () => {
    const res = await request(app).post("/auth/login").send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email });
    expect(res.body.user.password).toBeUndefined();
  });

  it("rejects login with an incorrect password using a generic message", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("rejects login with a non-existent email using the same generic message", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: uniqueEmail("login-nonexistent"), password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("returns the exact same error message for wrong password and unknown email", async () => {
    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email, password: "wrong-password" });

    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: uniqueEmail("login-nonexistent-2"), password: "whatever123" });

    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it("rejects login when the request body fails validation", async () => {
    const res = await request(app).post("/auth/login").send({ email: "not-an-email" });

    expect(res.status).toBe(422);
  });
});
