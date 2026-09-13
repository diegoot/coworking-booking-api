import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { BUSINESS_HOURS_START, BUSINESS_HOURS_END, BUSINESS_TIMEZONE } from "../config/businessHours.js";

// Shared by any module that needs to validate a time range against the
// coworking's business hours (currently: bookings, when creating a
// booking). Encapsulates the timezone-aware logic already established in
// rooms.service.ts (getRoomAvailability) so it isn't duplicated.
//
// A range is valid only if it falls entirely within a single calendar
// day (Argentina wall-clock time) and within [BUSINESS_HOURS_START,
// BUSINESS_HOURS_END] of that day. Checking `start >= dayStart && end <=
// dayEnd`, where dayStart/dayEnd are that day's business-hours
// boundaries, is sufficient on its own to reject both out-of-hours
// ranges and ranges that cross midnight (a range spanning into the next
// day would have to end after dayEnd).
export function isWithinBusinessHours(startTime: Date, endTime: Date): boolean {
  const startDay = formatInTimeZone(startTime, BUSINESS_TIMEZONE, "yyyy-MM-dd");

  const dayStart = fromZonedTime(
    `${startDay}T${String(BUSINESS_HOURS_START).padStart(2, "0")}:00:00.000`,
    BUSINESS_TIMEZONE
  );
  const dayEnd = fromZonedTime(
    `${startDay}T${String(BUSINESS_HOURS_END).padStart(2, "0")}:00:00.000`,
    BUSINESS_TIMEZONE
  );

  return startTime >= dayStart && endTime <= dayEnd;
}
