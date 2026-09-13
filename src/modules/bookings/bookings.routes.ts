import { Router } from "express";
import { deleteBooking, getBookingsByUserId, getMyBookings, postBooking } from "./bookings.controller.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";

export const bookingsRouter = Router();

// Order matters: "/me" must be registered before "/:userId", otherwise
// Express would match "me" as a :userId param on the admin route.
bookingsRouter.get("/me", authenticate, getMyBookings);
bookingsRouter.get("/:userId", authenticate, authorize("ADMIN"), getBookingsByUserId);
bookingsRouter.post("/", authenticate, postBooking);
// Ownership-or-admin can't be split into two separate routes cleanly
// (unlike the GET endpoints above), so the check is done inside the
// service layer instead of via `authorize`, which only knows about
// roles, not resource ownership.
bookingsRouter.delete("/:id", authenticate, deleteBooking);
