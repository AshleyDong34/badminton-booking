import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function autoSessionName(startLocal: Date, endLocal: Date) {
  const weekday = startLocal.toLocaleDateString("en-GB", { weekday: "long" });
  const day = ordinal(startLocal.getDate());
  const startT = formatTime(startLocal);
  const endT = formatTime(endLocal);
  return `${weekday} ${day} ${startT}-${endT}`;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();

  const nameInput = String(form.get("name") || "").trim();
  const start = String(form.get("start") || "").trim();
  const end = String(form.get("end") || "").trim();
  const capacity = Number(form.get("capacity") || 0);
  const notes = String(form.get("notes") || "").trim();
  const allow_name_only = String(form.get("allow_name_only")) === "true";

  if (!start) return new NextResponse("Missing start", { status: 400 });
  if (!end) return new NextResponse("Missing end", { status: 400 });
  if (!Number.isFinite(capacity) || capacity < 1) {
    return new NextResponse("Bad capacity", { status: 400 });
  }

  const startLocal = new Date(start);
  const endLocal = new Date(end);

  if (!(endLocal > startLocal)) {
    return new NextResponse("End must be after start", { status: 400 });
  }

  const name = nameInput || autoSessionName(startLocal, endLocal);

  const supabase = supabaseServer();
  const { error } = await supabase.from("sessions").insert({
    name,
    starts_at: startLocal.toISOString(),
    ends_at: endLocal.toISOString(),
    capacity,
    notes: notes || null,
    allow_name_only,
  });

  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.redirect(new URL("/admin/sessions", getBaseUrl(req)));
}
