import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import type { EventType } from "@/lib/club-champs-knockout";

const EVENTS = new Set<EventType>(["level_doubles", "mixed_doubles"]);

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const wantsJson = req.headers.get("x-admin-fetch") === "1";
  const event = String(form.get("event") ?? "").trim() as EventType;
  const stage = Number(form.get("stage"));
  const bestOf = Number(form.get("best_of"));
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/knockout-matches");
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
  if (!Number.isInteger(stage) || stage < 1) {
    return toError("Invalid stage");
  }
  if (bestOf !== 1 && bestOf !== 3) {
    return toError("Format must be best of 1 or 3");
  }

  const db = supabaseServer();
  const { data: stageRows, error: stageReadError } = await db
    .from("club_champs_knockout_matches")
    .select("id,pair_a_id,pair_b_id,pair_a_score,pair_b_score,winner_pair_id")
    .eq("event", event)
    .eq("stage", stage);

  if (stageReadError) {
    return toError(stageReadError.message, 500);
  }

  const hasScoredNonByeMatch = (stageRows ?? []).some((row) => {
    const isNonBye = row.pair_a_id != null && row.pair_b_id != null;
    const hasScore = row.pair_a_score != null || row.pair_b_score != null;
    return isNonBye && hasScore;
  });

  if (hasScoredNonByeMatch) {
    return toError("Cannot change format after stage has started");
  }

  const { error: updateError } = await db
    .from("club_champs_knockout_matches")
    .update({ best_of: bestOf })
    .eq("event", event)
    .eq("stage", stage);

  if (updateError) {
    return toError(updateError.message, 500);
  }

  return toSuccess(
    { format_saved: true, event, stage, best_of: bestOf },
    `${redirect}${redirect.includes("?") ? "&" : "?"}format_saved=1`
  );
}
