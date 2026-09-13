// Business-hours configuration for the coworking space. This is a
// cross-cutting concern shared by multiple business modules (rooms,
// bookings), so it lives in shared/ rather than inside a single module
// — keeping it in one module (e.g. rooms/) would force sideways imports
// between business modules (bookings -> rooms), which is not allowed
// (dependencies must flow toward auth/shared, not sideways).
//
// This is a fixed, global schedule shared by every room — not a
// per-room setting, so it does not belong in the Prisma schema. If
// per-room schedules are ever needed, this becomes a Room field/table
// instead.
export const BUSINESS_HOURS_START = 8; // 08:00
export const BUSINESS_HOURS_END = 20; // 20:00

// The coworking operates on Argentina local time regardless of the
// timezone of the server/host running the app. All business-hours
// calculations must be anchored to this timezone, not to the server's
// local time or to UTC.
export const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
