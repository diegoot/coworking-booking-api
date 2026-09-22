import { Router } from "express";
import { deleteBooking, getBookings, getMyBookings, postBooking } from "./bookings.controller.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";

export const bookingsRouter = Router();

bookingsRouter.get("/me", authenticate, getMyBookings);
// Admin-only: lists every booking, optionally filtered by date/roomId/
// userId (all combinable query params, AND'd together). No filters
// returns every booking in the system.
bookingsRouter.get("/", authenticate, authorize("ADMIN"), getBookings);
bookingsRouter.post("/", authenticate, postBooking);
// Ownership-or-admin can't be split into two separate routes cleanly
// (unlike the GET endpoints above), so the check is done inside the
// service layer instead of via `authorize`, which only knows about
// roles, not resource ownership.
bookingsRouter.delete("/:id", authenticate, deleteBooking);
