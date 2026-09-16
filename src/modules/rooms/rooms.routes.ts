import { Router } from "express";
import { getRooms, getRoom, postRoom, getRoomAvailabilityHandler } from "./rooms.controller.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";

export const roomsRouter = Router();

// Public: browsing rooms never requires auth (no user-identifying data in
// the response) — only creating a room or booking one does.
roomsRouter.get("/", getRooms);
roomsRouter.post("/", authenticate, authorize("ADMIN"), postRoom);
roomsRouter.get("/:id", getRoom);
roomsRouter.get("/:id/availability", authenticate, getRoomAvailabilityHandler);
