import { Router } from "express";
import { getUsers } from "./users.controller.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";

export const usersRouter = Router();

usersRouter.get("/", authenticate, authorize("ADMIN"), getUsers);
