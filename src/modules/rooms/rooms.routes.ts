import { Router } from "express";
import { getRooms, postRoom, getRoomAvailabilityHandler } from "./rooms.controller.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";

export const roomsRouter = Router();

roomsRouter.get("/", authenticate, getRooms);
roomsRouter.post("/", authenticate, authorize("ADMIN"), postRoom);
roomsRouter.get("/:id/availability", authenticate, getRoomAvailabilityHandler);
