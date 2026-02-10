const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/London",
});

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/London",
});

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

export function formatAdminSessionDateRange(
  startsAt: string | null,
  endsAt: string | null
): string {
  if (!startsAt) return "Date/time not set";

  const start = new Date(startsAt);
  if (!isValidDate(start)) return "Date/time not set";

  const startDate = DATE_FMT.format(start);
  const startTime = TIME_FMT.format(start);

  if (!endsAt) return `${startDate}, ${startTime}`;

  const end = new Date(endsAt);
  if (!isValidDate(end)) return `${startDate}, ${startTime}`;

  const endDate = DATE_FMT.format(end);
  const endTime = TIME_FMT.format(end);

  if (startDate === endDate) return `${startDate}, ${startTime}-${endTime}`;

  return `${startDate}, ${startTime} - ${endDate}, ${endTime}`;
}
