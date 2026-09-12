import type { Request } from "express";
import type { Role } from "@prisma/client";

// Shape of the authenticated user attached to `req` by the auth
// middleware (implemented in modules/auth/). Lives in shared/types
// because it's consumed by several business modules (bookings, rooms,
// users) that need to know "who is making this request" without
// depending on the auth module's internals.
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
