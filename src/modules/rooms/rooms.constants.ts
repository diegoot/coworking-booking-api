// Slot granularity for the room availability view (GET /rooms/:id/availability).
// This is specific to how rooms expose their schedule as discrete slots —
// bookings themselves don't need it, they just need start/end within
// business hours — so it stays local to this module instead of moving to
// shared/. BUSINESS_HOURS_START/END/BUSINESS_TIMEZONE moved to
// shared/config/businessHours.ts because bookings also needs them, and
// keeping them here would force a sideways bookings -> rooms import.
export const SLOT_DURATION_HOURS = 1;
