import { describe, it, expect } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { isWithinBusinessHours } from "../businessHours.js";
import { BUSINESS_TIMEZONE } from "../../config/businessHours.js";

// Fixed test date, unrelated to any DB fixture. Business hours are
// Argentina wall-clock time; these Date instances represent the real
// UTC instant corresponding to that Argentina local time.
const TEST_DATE = "2027-06-15";

function argentinaTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}`, BUSINESS_TIMEZONE);
}

describe("isWithinBusinessHours", () => {
  it("returns true when the range starts exactly at 08:00 (inclusive lower bound)", () => {
    const start = argentinaTime(TEST_DATE, "08:00:00.000");
    const end = argentinaTime(TEST_DATE, "09:00:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(true);
  });

  it("returns false when the range starts one minute before 08:00", () => {
    const start = argentinaTime(TEST_DATE, "07:59:00.000");
    const end = argentinaTime(TEST_DATE, "09:00:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(false);
  });

  it("returns true when the range ends exactly at 20:00 (inclusive upper bound)", () => {
    const start = argentinaTime(TEST_DATE, "19:00:00.000");
    const end = argentinaTime(TEST_DATE, "20:00:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(true);
  });

  it("returns false when the range ends one minute after 20:00", () => {
    const start = argentinaTime(TEST_DATE, "19:00:00.000");
    const end = argentinaTime(TEST_DATE, "20:01:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(false);
  });

  it("returns true for a range fully inside business hours", () => {
    const start = argentinaTime(TEST_DATE, "10:00:00.000");
    const end = argentinaTime(TEST_DATE, "14:00:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(true);
  });

  it("returns false for a range that crosses midnight into the next day", () => {
    const start = argentinaTime(TEST_DATE, "23:00:00.000");
    const nextDay = "2027-06-16";
    const end = argentinaTime(nextDay, "01:00:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(false);
  });

  it("evaluates business hours relative to the day of startTime, not a fixed date", () => {
    const otherDate = "2027-09-01";
    const start = argentinaTime(otherDate, "08:00:00.000");
    const end = argentinaTime(otherDate, "20:00:00.000");

    expect(isWithinBusinessHours(start, end)).toBe(true);
  });
});
