import type { NextFunction, Request, Response } from "express";
import { listUsers } from "./users.service.js";

export async function getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await listUsers();
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}
