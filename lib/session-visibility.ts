const CLUB_TIME_ZONE = "Europe/London";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function getClubDateParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);

  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
  };
}

function addCalendarDays(parts: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);

  const localAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );

  return (localAsUtc - date.getTime()) / 60_000;
}

function clubWallClockToUtc(
  parts: DateParts,
  hour: number,
  minute: number,
  second: number,
  millisecond: number
) {
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
    millisecond
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(
    new Date(wallClockAsUtc),
    CLUB_TIME_ZONE
  );

  return new Date(wallClockAsUtc - offsetMinutes * 60_000);
}

export function safeBookingWindowDays(value: unknown) {
  const days = Number(value ?? 7);
  return Number.isFinite(days) && days >= 0 ? days : 7;
}

export function bookingWindowEndUtc(now: Date, days: number) {
  const today = getClubDateParts(now);
  const finalVisibleDay = addCalendarDays(today, days);
  return clubWallClockToUtc(finalVisibleDay, 23, 59, 59, 999);
}

export function bookingWindowOpensUtc(startIso: string, days: number) {
  const startDay = getClubDateParts(new Date(startIso));
  const openingDay = addCalendarDays(startDay, -days);
  return clubWallClockToUtc(openingDay, 0, 0, 0, 0);
}
