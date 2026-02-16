import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

type EventType = "level_doubles" | "mixed_doubles";

type MatchRow = {
  id: string;
  event: EventType;
  pool_number: number;
  match_order: number;
  pair_a_id: string;
  pair_b_id: string;
  pair_a_score: number | null;
  pair_b_score: number | null;
  is_playing: boolean;
};

type PairRow = {
  id: string;
  player_one_name: string;
  player_two_name: string;
};

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function pairPlayers(pair: PairRow | undefined) {
  if (!pair) return [];
  return [normalizeName(pair.player_one_name), normalizeName(pair.player_two_name)].filter(Boolean);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const wantsJson = req.headers.get("x-admin-fetch") === "1";
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/pools");
  const anchor =
    String(req.nextUrl.searchParams.get("row_anchor") ?? "").trim() ||
    String(form.get("anchor") ?? "").trim();
  const toRedirect = (path: string) => {
    const url = new URL(path, getBaseUrl(req));
    if (anchor) url.hash = anchor;
    return NextResponse.redirect(url, 303);
  };
  const toError = (message: string, status = 400) =>
    wantsJson
      ? NextResponse.json({ ok: false, error: message }, { status })
      : toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
  const toSuccess = (payload: Record<string, unknown>, redirectPath: string) =>
    wantsJson ? NextResponse.json({ ok: true, ...payload }) : toRedirect(redirectPath);

  const matchId = String(form.get("match_id") ?? "").trim();
  if (!matchId) {
    return toError("Missing match id");
  }

  const db = supabaseServer();
  const { data: matchData, error: matchError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,is_playing")
    .eq("id", matchId)
    .single();

  if (matchError || !matchData) {
    return toError(matchError?.message ?? "Match not found", matchError ? 500 : 404);
  }

  const match = matchData as MatchRow;
  const nextPlaying = !match.is_playing;

  if (nextPlaying && match.pair_a_score != null && match.pair_b_score != null) {
    return toError("Cannot mark a scored match as playing");
  }

  if (nextPlaying) {
    const { data: playingRows, error: playingError } = await db
      .from("club_champs_pool_matches")
      .select("id,pair_a_id,pair_b_id")
      .eq("is_playing", true)
      .neq("id", match.id);

    if (playingError) {
      return toError(playingError.message, 500);
    }

    const pairIds = new Set<string>([match.pair_a_id, match.pair_b_id]);
    for (const row of playingRows ?? []) {
      if (row.pair_a_id) pairIds.add(row.pair_a_id);
      if (row.pair_b_id) pairIds.add(row.pair_b_id);
    }

    const { data: pairData, error: pairError } = await db
      .from("club_champs_pairs")
      .select("id,player_one_name,player_two_name")
      .in("id", [...pairIds]);

    if (pairError) {
      return toError(pairError.message, 500);
    }

    const pairById = new Map((pairData ?? []).map((pair) => [pair.id, pair as PairRow]));
    const busyPlayers = new Set<string>();
    for (const row of playingRows ?? []) {
      for (const key of pairPlayers(pairById.get(row.pair_a_id))) busyPlayers.add(key);
      for (const key of pairPlayers(pairById.get(row.pair_b_id))) busyPlayers.add(key);
    }

    const selectedPlayers = [
      ...pairPlayers(pairById.get(match.pair_a_id)),
      ...pairPlayers(pairById.get(match.pair_b_id)),
    ];

    if (selectedPlayers.some((name) => busyPlayers.has(name))) {
      return toError("One or more players are already in play");
    }
  }

  const { error: updateError } = await db
    .from("club_champs_pool_matches")
    .update({ is_playing: nextPlaying })
    .eq("id", match.id);

  if (updateError) {
    return toError(updateError.message, 500);
  }

  return toSuccess(
    {
      playing: 1,
      match: {
        ...match,
        is_playing: nextPlaying,
      },
    },
    `${redirect}${redirect.includes("?") ? "&" : "?"}playing=1`
  );
}
