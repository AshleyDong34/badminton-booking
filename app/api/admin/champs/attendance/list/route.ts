import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ ok: false, error }, { status });
  }

  const db = supabaseServer();
  const { data, error } = await db
    .from("club_champs_pair_attendance")
    .select("pair_id,player_one_present,player_two_present");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
