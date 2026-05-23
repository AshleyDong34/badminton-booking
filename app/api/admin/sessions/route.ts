import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

const CLUB_TIME_ZONE = "Europe/London";

function parseLocalDateTime(value: string) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };

  const check = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute)
  );
  const isValid =
    check.getUTCFullYear() === parsed.year &&
    check.getUTCMonth() === parsed.month - 1 &&
    check.getUTCDate() === parsed.day &&
    check.getUTCHours() === parsed.hour &&
    check.getUTCMinutes() === parsed.minute;

  return isValid ? parsed : null;
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

function londonDateTimeToUtc(value: string) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return null;

  const wallClockAsUtc = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(
    new Date(wallClockAsUtc),
    CLUB_TIME_ZONE
  );

  return new Date(wallClockAsUtc - offsetMinutes * 60_000);
}

function formatTimeFromLocalDateTime(value: string) {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return "";

  let h = parsed.hour;
  const m = parsed.minute;
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function autoSessionName(location: string, startLocal: string, endLocal: string) {
  const startT = formatTimeFromLocalDateTime(startLocal);
  const endT = formatTimeFromLocalDateTime(endLocal);
  return `${location} at ${startT}-${endT}`;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();

  const location = String(form.get("location") || "").trim();
  const start = String(form.get("start") || "").trim();
  const end = String(form.get("end") || "").trim();
  const capacity = Number(form.get("capacity") || 0);
  const notes = String(form.get("notes") || "").trim();
  const allow_name_only = String(form.get("allow_name_only")) === "true";

  if (!location) return new NextResponse("Missing location", { status: 400 });
  if (!start) return new NextResponse("Missing start", { status: 400 });
  if (!end) return new NextResponse("Missing end", { status: 400 });
  if (!Number.isFinite(capacity) || capacity < 1) {
    return new NextResponse("Bad capacity", { status: 400 });
  }

  const startUtc = londonDateTimeToUtc(start);
  const endUtc = londonDateTimeToUtc(end);

  if (!startUtc || !endUtc) {
    return new NextResponse("Bad date/time", { status: 400 });
  }

  if (!(endUtc > startUtc)) {
    return new NextResponse("End must be after start", { status: 400 });
  }

  const name = autoSessionName(location, start, end);

  const supabase = supabaseServer();
  const { error } = await supabase.from("sessions").insert({
    name,
    starts_at: startUtc.toISOString(),
    ends_at: endUtc.toISOString(),
    capacity,
    notes: notes || null,
    allow_name_only,
  });

  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.redirect(new URL("/admin/sessions", getBaseUrl(req)));
}
