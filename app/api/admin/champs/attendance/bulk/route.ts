import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

type BulkBody = {
  present?: boolean;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ ok: false, error }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as BulkBody;
  const present = body.present;
  if (typeof present !== "boolean") {
    return NextResponse.json({ ok: false, error: "Invalid bulk attendance payload." }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: pairs, error: pairError } = await db
    .from("club_champs_pairs")
    .select("id");

  if (pairError) {
    return NextResponse.json({ ok: false, error: pairError.message }, { status: 500 });
  }

  const pairIds = (pairs ?? []).map((row) => row.id);
  if (pairIds.length === 0) {
    return NextResponse.json({ ok: true, rows: [] });
  }

  const payload = pairIds.map((pairId) => ({
    pair_id: pairId,
    player_one_present: present,
    player_two_present: present,
    updated_at: new Date().toISOString(),
  }));

  const { data: updated, error: updateError } = await db
    .from("club_champs_pair_attendance")
    .upsert(payload, { onConflict: "pair_id" })
    .select("pair_id,player_one_present,player_two_present")
    .in("pair_id", pairIds);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: updated ?? [] });
}
