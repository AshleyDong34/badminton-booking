const ukTimeZone = "Europe/London";

function shortTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ukTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase()
    .replace(/\s/g, "");
}

export function displaySessionName(name: string, startsAt: string | null, endsAt?: string | null) {
  if (!startsAt || !endsAt) return name;
  const match = name.match(/^(.*?)\s+at\s+(\d{1,2}:\d{2}\s*[ap]m)\s*[-–]\s*(\d{1,2}:\d{2}\s*[ap]m)$/i);
  if (!match?.[1]) return name;
  const normalize = (value: string) => value.toLowerCase().replace(/\s/g, "");
  return normalize(match[2]) === shortTime(startsAt) && normalize(match[3]) === shortTime(endsAt)
    ? match[1]
    : name;
}

export function formatSessionDateTime(startsAt: string | null, endsAt?: string | null) {
  if (!startsAt) return "TBC";
  const day = new Date(startsAt).toLocaleDateString("en-GB", {
    timeZone: ukTimeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const format24Hour = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: ukTimeZone,
      hour: "2-digit",
      minute: "2-digit",
    });
  return endsAt
    ? `${day} · ${format24Hour(startsAt)}–${format24Hour(endsAt)}`
    : `${day} · ${format24Hour(startsAt)}`;
}
