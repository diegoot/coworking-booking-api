import cors from "cors";
import express, { type Express } from "express";
import { errorHandler } from "./shared/errors/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { roomsRouter } from "./modules/rooms/rooms.routes.js";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Healthcheck endpoint. No business logic — just proof the process
  // is up and accepting requests.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Business module routers get mounted here as they're implemented,
  // e.g. app.use("/bookings", bookingsRouter);
  app.use("/auth", authRouter);
  app.use("/rooms", roomsRouter);

  // Centralized error handler must be the last middleware mounted so
  // it catches errors from every route/middleware above it.
  app.use(errorHandler);

  return app;
}
