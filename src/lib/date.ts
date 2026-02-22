import { DateTime } from "luxon";

import { ApiError } from "@/lib/errors";

export function dateOnlyToUtcNoon(dateString: string): Date {
  const dt = DateTime.fromISO(dateString, { zone: "utc" });
  if (!dt.isValid) {
    throw new ApiError(400, "INVALID_REQUEST", `Invalid date: ${dateString}`);
  }

  return dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

export function toDateOnly(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(timezone).toISODate() ?? "";
}
