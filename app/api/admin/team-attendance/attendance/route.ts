import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

function isValidDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const body = await req.json().catch(() => ({}));
  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  const weekStart = typeof body.weekStart === "string" ? body.weekStart : "";
  const attended = typeof body.attended === "boolean" ? body.attended : null;

  if (!memberId || !isValidDateString(weekStart) || attended === null) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const db = supabaseServer();
  const now = new Date().toISOString();
  const { error } = await db.from("team_training_attendance").upsert(
    {
      member_id: memberId,
      week_start: weekStart,
      attended,
      marked_at: now,
      updated_at: now,
    },
    { onConflict: "member_id,week_start" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
