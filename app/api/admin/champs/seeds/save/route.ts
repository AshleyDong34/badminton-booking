import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";

const EVENTS = new Set(["level_doubles", "mixed_doubles"]);

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const body = await req.json().catch(() => ({}));
  const event = String(body.event ?? "").trim();
  const idsRaw = Array.isArray(body.ids) ? body.ids : [];
  const ids = idsRaw.filter((id: unknown): id is string => typeof id === "string");

  if (!EVENTS.has(event)) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "No pairs supplied." }, { status: 400 });
  }

  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length !== ids.length) {
    return NextResponse.json({ error: "Duplicate ids in request." }, { status: 400 });
  }

  const db = supabaseServer();
  const { data: existing, error: existingErr } = await db
    .from("club_champs_pairs")
    .select("id")
    .eq("event", event)
    .in("id", ids);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if ((existing ?? []).length !== ids.length) {
    return NextResponse.json({ error: "Some pairs are missing for this event." }, { status: 400 });
  }

  const updates = ids.map((id: string, index: number) =>
    db
      .from("club_champs_pairs")
      .update({ seed_order: index + 1 })
      .eq("id", id)
      .eq("event", event)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const { error: resetPoolsError } = await db
    .from("club_champs_pool_matches")
    .delete()
    .eq("event", event);
  if (resetPoolsError) {
    return NextResponse.json({ error: resetPoolsError.message }, { status: 500 });
  }

  const { error: resetKnockoutError } = await db
    .from("club_champs_knockout_matches")
    .delete()
    .eq("event", event);
  if (resetKnockoutError) {
    return NextResponse.json({ error: resetKnockoutError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, downstreamReset: true });
}
