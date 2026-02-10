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
  const event = String(form.get("event") ?? "").trim() as EventType;
  const stage = Number(form.get("stage"));
  const bestOf = Number(form.get("best_of"));
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/knockout-matches");

  if (!EVENTS.has(event)) {
    return NextResponse.redirect(
      new URL(`${redirect}${redirect.includes("?") ? "&" : "?"}error=Invalid+event`, getBaseUrl(req))
    );
  }
  if (!Number.isInteger(stage) || stage < 1) {
    return NextResponse.redirect(
      new URL(`${redirect}${redirect.includes("?") ? "&" : "?"}error=Invalid+stage`, getBaseUrl(req))
    );
  }
  if (bestOf !== 1 && bestOf !== 3) {
    return NextResponse.redirect(
      new URL(`${redirect}${redirect.includes("?") ? "&" : "?"}error=Format+must+be+best+of+1+or+3`, getBaseUrl(req))
    );
  }

  const db = supabaseServer();
  const { data: stageRows, error: stageReadError } = await db
    .from("club_champs_knockout_matches")
    .select("id,pair_a_id,pair_b_id,pair_a_score,pair_b_score,winner_pair_id")
    .eq("event", event)
    .eq("stage", stage);

  if (stageReadError) {
    return NextResponse.redirect(
      new URL(
        `${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(stageReadError.message)}`,
        getBaseUrl(req)
      )
    );
  }

  const hasScoredNonByeMatch = (stageRows ?? []).some((row) => {
    const isNonBye = row.pair_a_id != null && row.pair_b_id != null;
    const hasScore = row.pair_a_score != null || row.pair_b_score != null;
    return isNonBye && hasScore;
  });

  if (hasScoredNonByeMatch) {
    return NextResponse.redirect(
      new URL(
        `${redirect}${redirect.includes("?") ? "&" : "?"}error=Cannot+change+format+after+stage+has+started`,
        getBaseUrl(req)
      )
    );
  }

  const { error: updateError } = await db
    .from("club_champs_knockout_matches")
    .update({ best_of: bestOf })
    .eq("event", event)
    .eq("stage", stage);

  if (updateError) {
    return NextResponse.redirect(
      new URL(
        `${redirect}${redirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(updateError.message)}`,
        getBaseUrl(req)
      )
    );
  }

  return NextResponse.redirect(
    new URL(`${redirect}${redirect.includes("?") ? "&" : "?"}format_saved=1`, getBaseUrl(req))
  );
}
