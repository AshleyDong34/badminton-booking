import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

const EVENTS = new Set(["level_doubles", "mixed_doubles"]);

type MatchMeta = {
  id: string;
  event: "level_doubles" | "mixed_doubles";
  pool_number: number;
  match_order: number;
  is_playing: boolean;
};

function parseScore(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) return NaN;
  return num;
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
  const event = String(form.get("event") ?? "").trim();
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/pools");
  const anchor = String(form.get("anchor") ?? "").trim();

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

  if (!EVENTS.has(event)) {
    return toError("Invalid event");
  }

  const db = supabaseServer();
  const { data: matchRows, error: matchError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,is_playing")
    .eq("event", event)
    .order("pool_number", { ascending: true })
    .order("match_order", { ascending: true });

  if (matchError) {
    return toError(matchError.message, 500);
  }

  const rows = (matchRows ?? []) as MatchMeta[];
  if (rows.length === 0) {
    return toError("No pool matches found for this event");
  }

  const updates: Array<{ id: string; pair_a_score: number | null; pair_b_score: number | null; is_playing: boolean }> = [];
  for (const row of rows) {
    const pairAScore = parseScore(form.get(`pair_a_score__${row.id}`));
    const pairBScore = parseScore(form.get(`pair_b_score__${row.id}`));

    if (Number.isNaN(pairAScore) || Number.isNaN(pairBScore)) {
      return toError(`Pool ${row.pool_number}, match ${row.match_order}: scores must be whole numbers or blank.`);
    }

    if ((pairAScore == null) !== (pairBScore == null)) {
      return toError(`Pool ${row.pool_number}, match ${row.match_order}: enter both scores or leave both blank.`);
    }

    updates.push({
      id: row.id,
      pair_a_score: pairAScore,
      pair_b_score: pairBScore,
      is_playing: row.is_playing,
    });
  }

  for (const update of updates) {
    const payload: { pair_a_score: number | null; pair_b_score: number | null; is_playing?: boolean } = {
      pair_a_score: update.pair_a_score,
      pair_b_score: update.pair_b_score,
    };
    if (update.pair_a_score != null && update.pair_b_score != null && update.is_playing) {
      payload.is_playing = false;
    }

    const { error } = await db
      .from("club_champs_pool_matches")
      .update(payload)
      .eq("id", update.id)
      .eq("event", event);

    if (error) {
      return toError(error.message, 500);
    }
  }

  const { error: clearKnockoutError } = await db
    .from("club_champs_knockout_matches")
    .delete()
    .eq("event", event);

  if (clearKnockoutError) {
    return toError(clearKnockoutError.message, 500);
  }

  const { data: updatedRows, error: updatedRowsError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,is_playing")
    .eq("event", event)
    .order("pool_number", { ascending: true })
    .order("match_order", { ascending: true });

  if (updatedRowsError) {
    return toError(updatedRowsError.message, 500);
  }

  return toSuccess(
    { updated: true, knockout_reset: true, event, matches: updatedRows ?? [] },
    `${redirect}${redirect.includes("?") ? "&" : "?"}updated=1&knockout_reset=1`
  );
}
