import "server-only";
import type { EventType } from "@/lib/club-champs-knockout";
import { supabaseServer } from "@/lib/supabase-server";

type KnockoutMatchRow = {
  id: string;
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

export async function clearDownstreamStages(
  db: ReturnType<typeof supabaseServer>,
  event: EventType,
  stage: number
) {
  const { error } = await db
    .from("club_champs_knockout_matches")
    .update({
      pair_a_id: null,
      pair_b_id: null,
      pair_a_score: null,
      pair_b_score: null,
      game_scores: null,
      winner_pair_id: null,
      is_unlocked: false,
    })
    .eq("event", event)
    .gt("stage", stage);

  return error;
}

export async function propagateKnockoutEvent(db: ReturnType<typeof supabaseServer>, event: EventType) {
  const { data, error } = await db
    .from("club_champs_knockout_matches")
    .select(
      "id,event,stage,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,game_scores,winner_pair_id,best_of,is_unlocked"
    )
    .eq("event", event)
    .order("stage", { ascending: true })
    .order("match_order", { ascending: true });

  if (error) return error;

  const rows = (data ?? []) as KnockoutMatchRow[];
  if (rows.length === 0) return null;

  const byStage = new Map<number, KnockoutMatchRow[]>();
  let maxStage = 0;
  for (const row of rows) {
    const list = byStage.get(row.stage) ?? [];
    list.push(row);
    byStage.set(row.stage, list);
    if (row.stage > maxStage) maxStage = row.stage;
  }

  for (let stage = 1; stage < maxStage; stage++) {
    const current = byStage.get(stage) ?? [];
    const next = byStage.get(stage + 1) ?? [];
    if (current.length === 0 || next.length === 0) continue;

    const stageComplete = current.every((m) => m.winner_pair_id);
    if (!stageComplete) break;

    for (let i = 0; i < next.length; i++) {
      const sourceA = current[i * 2];
      const sourceB = current[i * 2 + 1];
      const pairA = sourceA?.winner_pair_id ?? null;
      const pairB = sourceB?.winner_pair_id ?? null;
      const autoWinner = pairA && !pairB ? pairA : pairB && !pairA ? pairB : null;

      const { error: updateError } = await db
        .from("club_champs_knockout_matches")
        .update({
          pair_a_id: pairA,
          pair_b_id: pairB,
          pair_a_score: null,
          pair_b_score: null,
          game_scores: null,
          winner_pair_id: autoWinner,
          is_unlocked: true,
        })
        .eq("id", next[i].id);

      if (updateError) return updateError;

      next[i].pair_a_id = pairA;
      next[i].pair_b_id = pairB;
      next[i].pair_a_score = null;
      next[i].pair_b_score = null;
      next[i].game_scores = null;
      next[i].winner_pair_id = autoWinner;
      next[i].is_unlocked = true;
    }
  }

  return null;
}
