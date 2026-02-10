import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import {
  buildKnockoutStageOneMatches,
  computeEventFromPools,
  resolveAdvanceCount,
  type EventType,
  type PairRow,
  type PoolMatchRow,
} from "@/lib/club-champs-knockout";
import { propagateKnockoutEvent } from "@/lib/club-champs-knockout-progress";

type KnockoutInsert = {
  event: EventType;
  stage: number;
  match_order: number;
  pair_a_id: string | null;
  pair_b_id: string | null;
  pair_a_score: number | null;
  pair_b_score: number | null;
  game_scores: { games: Array<{ a: number | null; b: number | null }> } | null;
  winner_pair_id: string | null;
  best_of: 1 | 3;
  is_unlocked: boolean;
};

async function initEventKnockout(args: {
  db: ReturnType<typeof supabaseServer>;
  event: EventType;
  qualifiers: ReturnType<typeof computeEventFromPools>["qualifiers"];
}) {
  const { db, event, qualifiers } = args;
  const { rounds, stageOneMatches } = buildKnockoutStageOneMatches(qualifiers);

  const { error: deleteError } = await db.from("club_champs_knockout_matches").delete().eq("event", event);
  if (deleteError) return deleteError;

  if (rounds <= 0 || stageOneMatches.length === 0) return null;

  const rows: KnockoutInsert[] = [];
  for (let stage = 1; stage <= rounds; stage++) {
    const matchCount = 2 ** (rounds - stage);
    for (let matchOrder = 1; matchOrder <= matchCount; matchOrder++) {
      if (stage === 1) {
        const base = stageOneMatches[matchOrder - 1];
        rows.push({
          event,
          stage,
          match_order: matchOrder,
          pair_a_id: base.pairAId,
          pair_b_id: base.pairBId,
          pair_a_score: null,
          pair_b_score: null,
          game_scores: null,
          winner_pair_id: base.autoWinnerId,
          best_of: 1,
          is_unlocked: true,
        });
      } else {
        rows.push({
          event,
          stage,
          match_order: matchOrder,
          pair_a_id: null,
          pair_b_id: null,
          pair_a_score: null,
          pair_b_score: null,
          game_scores: null,
          winner_pair_id: null,
          best_of: 1,
          is_unlocked: false,
        });
      }
    }
  }

  const { error: insertError } = await db.from("club_champs_knockout_matches").insert(rows);
  if (insertError) return insertError;

  return propagateKnockoutEvent(db, event);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/knockout-matches");
  const rawAdvanceLevel = String(form.get("advance_level") ?? "").trim();
  const rawAdvanceMixed = String(form.get("advance_mixed") ?? "").trim();

  const db = supabaseServer();
  const { data: pairData, error: pairError } = await db
    .from("club_champs_pairs")
    .select(
      "id,event,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order"
    );
  if (pairError) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=${encodeURIComponent(pairError.message)}`, getBaseUrl(req))
    );
  }

  const { data: poolData, error: poolError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score");
  if (poolError) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=${encodeURIComponent(poolError.message)}`, getBaseUrl(req))
    );
  }

  const pairs = (pairData ?? []) as PairRow[];
  const poolMatches = (poolData ?? []) as PoolMatchRow[];

  const levelPoolCount = new Set(poolMatches.filter((m) => m.event === "level_doubles").map((m) => m.pool_number))
    .size;
  const mixedPoolCount = new Set(poolMatches.filter((m) => m.event === "mixed_doubles").map((m) => m.pool_number))
    .size;
  const levelTotal = pairs.filter((p) => p.event === "level_doubles").length;
  const mixedTotal = pairs.filter((p) => p.event === "mixed_doubles").length;

  const advanceLevel = resolveAdvanceCount(rawAdvanceLevel, levelTotal, levelPoolCount);
  const advanceMixed = resolveAdvanceCount(rawAdvanceMixed, mixedTotal, mixedPoolCount);

  const levelResult = computeEventFromPools({
    event: "level_doubles",
    pairs,
    matches: poolMatches,
    advanceCount: advanceLevel,
  });
  const mixedResult = computeEventFromPools({
    event: "mixed_doubles",
    pairs,
    matches: poolMatches,
    advanceCount: advanceMixed,
  });

  const levelInitError = await initEventKnockout({
    db,
    event: "level_doubles",
    qualifiers: levelResult.qualifiers,
  });
  if (levelInitError) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=${encodeURIComponent(levelInitError.message)}`, getBaseUrl(req))
    );
  }

  const mixedInitError = await initEventKnockout({
    db,
    event: "mixed_doubles",
    qualifiers: mixedResult.qualifiers,
  });
  if (mixedInitError) {
    return NextResponse.redirect(
      new URL(`${redirect}?error=${encodeURIComponent(mixedInitError.message)}`, getBaseUrl(req))
    );
  }

  return NextResponse.redirect(
    new URL(
      `${redirect}?advance_level=${advanceLevel}&advance_mixed=${advanceMixed}&initialized=1`,
      getBaseUrl(req)
    )
  );
}
