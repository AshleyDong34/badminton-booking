import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { clearDownstreamStages, propagateKnockoutEvent } from "@/lib/club-champs-knockout-progress";
import type { EventType } from "@/lib/club-champs-knockout";

type MatchRow = {
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

type GameScore = { a: number | null; b: number | null };

type ParseGamesResult =
  | { ok: true; games: GameScore[] }
  | { ok: false; error: string };

type DetermineWinnerResult =
  | {
      ok: true;
      pairAScore: number | null;
      pairBScore: number | null;
      gameScores: { games: GameScore[] } | null;
      winnerPairId: string | null;
    }
  | { ok: false; error: string };

function parseScore(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return NaN;
  return n;
}

function parseGames(form: FormData, bestOf: 1 | 3): ParseGamesResult {
  const gameCount = bestOf === 1 ? 1 : 3;
  const games: GameScore[] = [];

  for (let i = 1; i <= gameCount; i++) {
    const a = parseScore(form.get(`game_${i}_a`));
    const b = parseScore(form.get(`game_${i}_b`));
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return { ok: false, error: "Scores must be whole numbers." };
    }
    if ((a == null) !== (b == null)) {
      return { ok: false, error: "Enter both scores for each game you fill." };
    }
    if (a != null && b != null && a === b) {
      return { ok: false, error: "A game score cannot be tied." };
    }
    games.push({ a, b });
  }

  return { ok: true, games };
}

function determineWinner(match: MatchRow, games: GameScore[]): DetermineWinnerResult {
  if (match.pair_a_id && !match.pair_b_id) {
    return {
      ok: true,
      pairAScore: null,
      pairBScore: null,
      gameScores: null,
      winnerPairId: match.pair_a_id,
    };
  }
  if (match.pair_b_id && !match.pair_a_id) {
    return {
      ok: true,
      pairAScore: null,
      pairBScore: null,
      gameScores: null,
      winnerPairId: match.pair_b_id,
    };
  }
  if (!match.pair_a_id || !match.pair_b_id) {
    return { ok: false, error: "Both pairs are not set for this match yet." };
  }

  // Prevent gaps like game1 filled, game2 blank, game3 filled.
  let seenBlank = false;
  for (const game of games) {
    const filled = game.a != null && game.b != null;
    if (!filled) seenBlank = true;
    if (seenBlank && filled) {
      return { ok: false, error: "Fill game scores in order without skipping games." };
    }
  }

  const completedGames = games.filter((g) => g.a != null && g.b != null);
  if (completedGames.length === 0) {
    return {
      ok: true,
      pairAScore: null,
      pairBScore: null,
      gameScores: { games },
      winnerPairId: null,
    };
  }

  let gamesWonA = 0;
  let gamesWonB = 0;
  for (const game of completedGames) {
    if ((game.a ?? 0) > (game.b ?? 0)) gamesWonA += 1;
    if ((game.b ?? 0) > (game.a ?? 0)) gamesWonB += 1;
  }

  if (match.best_of === 1) {
    if (completedGames.length > 1) {
      return { ok: false, error: "Best-of-1 allows only one game score." };
    }
    if (completedGames.length === 0) {
      return {
        ok: true,
        pairAScore: null,
        pairBScore: null,
        gameScores: { games },
        winnerPairId: null,
      };
    }
    return {
      ok: true,
      pairAScore: completedGames[0].a,
      pairBScore: completedGames[0].b,
      gameScores: { games },
      winnerPairId: gamesWonA > gamesWonB ? match.pair_a_id : match.pair_b_id,
    };
  }

  // Best-of-3:
  // - 2-0 can finish after two games
  // - 1-1 after two games needs game 3
  // - three games always final
  if (completedGames.length === 1) {
    return {
      ok: true,
      pairAScore: gamesWonA,
      pairBScore: gamesWonB,
      gameScores: { games },
      winnerPairId: null,
    };
  }

  if (completedGames.length === 2 && gamesWonA === 1 && gamesWonB === 1) {
    return {
      ok: true,
      pairAScore: gamesWonA,
      pairBScore: gamesWonB,
      gameScores: { games },
      winnerPairId: null,
    };
  }

  if (completedGames.length >= 2 && (gamesWonA >= 2 || gamesWonB >= 2)) {
    return {
      ok: true,
      pairAScore: gamesWonA,
      pairBScore: gamesWonB,
      gameScores: { games },
      winnerPairId: gamesWonA > gamesWonB ? match.pair_a_id : match.pair_b_id,
    };
  }

  if (completedGames.length !== 3) {
    return {
      ok: true,
      pairAScore: gamesWonA,
      pairBScore: gamesWonB,
      gameScores: { games },
      winnerPairId: null,
    };
  }

  const winnerPairId = gamesWonA > gamesWonB ? match.pair_a_id : match.pair_b_id;

  return {
    ok: true,
    pairAScore: gamesWonA,
    pairBScore: gamesWonB,
    gameScores: { games },
    winnerPairId,
  };
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const id = String(form.get("id") ?? "").trim();
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/knockout-matches");
  const anchor = String(form.get("anchor") ?? "").trim();
  const toRedirect = (path: string) => {
    const url = new URL(path, getBaseUrl(req));
    if (anchor) url.hash = anchor;
    return NextResponse.redirect(url, 303);
  };

  if (!id) {
    return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=Missing+match+id`);
  }
  const db = supabaseServer();
  const { data: match, error: matchError } = await db
    .from("club_champs_knockout_matches")
    .select(
      "id,event,stage,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,game_scores,winner_pair_id,best_of,is_unlocked"
    )
    .eq("id", id)
    .single();

  if (matchError || !match) {
    return toRedirect(
      `${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(
        matchError?.message ?? "Match not found"
      )}`
    );
  }

  const row = match as MatchRow;
  if (!row.is_unlocked) {
    return toRedirect(
      `${redirect}${redirect.includes("?") ? "&" : "?"}error=This+stage+is+locked+until+previous+stage+is+complete`
    );
  }

  const parsed = parseGames(form, row.best_of);
  if (!parsed.ok) {
    return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(parsed.error)}`);
  }

  const decided = determineWinner(row, parsed.games);
  if (!decided.ok) {
    return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(decided.error)}`);
  }

  const { error: updateError } = await db
    .from("club_champs_knockout_matches")
    .update({
      pair_a_score: decided.pairAScore,
      pair_b_score: decided.pairBScore,
      game_scores: decided.gameScores,
      winner_pair_id: decided.winnerPairId,
    })
    .eq("id", id);
  if (updateError) {
    return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(updateError.message)}`);
  }

  const downstreamError = await clearDownstreamStages(db, row.event, row.stage);
  if (downstreamError) {
    return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(downstreamError.message)}`);
  }

  const propagateError = await propagateKnockoutEvent(db, row.event);
  if (propagateError) {
    return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(propagateError.message)}`);
  }

  return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}updated=1`);
}
