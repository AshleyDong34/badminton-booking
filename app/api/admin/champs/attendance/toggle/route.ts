import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

type PlayerSlot = "player_one" | "player_two";

type ToggleBody = {
  pairId?: string;
  slot?: PlayerSlot;
  present?: boolean;
};

type PairRow = {
  id: string;
  player_one_name: string;
  player_two_name: string;
};

type AttendanceRow = {
  pair_id: string;
  player_one_present: boolean | null;
  player_two_present: boolean | null;
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ ok: false, error }, { status });
  }

  const body = (await req.json().catch(() => ({}))) as ToggleBody;
  const pairId = String(body.pairId ?? "").trim();
  const slot = body.slot;
  const present = body.present;

  if (!pairId || (slot !== "player_one" && slot !== "player_two") || typeof present !== "boolean") {
    return NextResponse.json({ ok: false, error: "Invalid attendance payload." }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: pair, error: pairError } = await db
    .from("club_champs_pairs")
    .select("id,player_one_name,player_two_name")
    .eq("id", pairId)
    .single();

  if (pairError || !pair) {
    return NextResponse.json(
      { ok: false, error: pairError?.message ?? "Pair not found." },
      { status: pairError ? 500 : 404 }
    );
  }

  const currentPair = pair as PairRow;
  const targetName = normalizeName(
    slot === "player_one" ? currentPair.player_one_name : currentPair.player_two_name
  );
  if (!targetName) {
    return NextResponse.json(
      { ok: false, error: "Selected player name is empty." },
      { status: 400 }
    );
  }

  const { data: allPairsData, error: allPairsError } = await db
    .from("club_champs_pairs")
    .select("id,player_one_name,player_two_name");

  if (allPairsError) {
    return NextResponse.json({ ok: false, error: allPairsError.message }, { status: 500 });
  }

  const allPairs = (allPairsData ?? []) as PairRow[];
  const impactedPairs = allPairs.filter((entry) => {
    const p1 = normalizeName(entry.player_one_name);
    const p2 = normalizeName(entry.player_two_name);
    return p1 === targetName || p2 === targetName;
  });

  if (impactedPairs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No matching pair entries found for this player." },
      { status: 404 }
    );
  }

  const impactedIds = impactedPairs.map((entry) => entry.id);
  const { data: existingRows, error: existingError } = await db
    .from("club_champs_pair_attendance")
    .select("pair_id,player_one_present,player_two_present")
    .in("pair_id", impactedIds);

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  const existingByPair = new Map<string, AttendanceRow>();
  for (const row of (existingRows ?? []) as AttendanceRow[]) {
    existingByPair.set(row.pair_id, row);
  }

  const payload = impactedPairs.map((entry) => {
    const current = existingByPair.get(entry.id);
    const p1Matches = normalizeName(entry.player_one_name) === targetName;
    const p2Matches = normalizeName(entry.player_two_name) === targetName;

    return {
      pair_id: entry.id,
      player_one_present: p1Matches
        ? present
        : Boolean(current?.player_one_present),
      player_two_present: p2Matches
        ? present
        : Boolean(current?.player_two_present),
      updated_at: new Date().toISOString(),
    };
  });

  const { data: updated, error: updateError } = await db
    .from("club_champs_pair_attendance")
    .upsert(payload, { onConflict: "pair_id" })
    .select("pair_id,player_one_present,player_two_present")
    .in("pair_id", impactedIds);

  if (updateError || !updated) {
    return NextResponse.json(
      { ok: false, error: updateError?.message ?? "Failed to save attendance." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, rows: updated });
}
