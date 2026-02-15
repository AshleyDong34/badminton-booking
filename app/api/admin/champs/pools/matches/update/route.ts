import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

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
  const id = String(form.get("id") ?? "").trim();
  const redirect = String(form.get("redirect") ?? "/admin/club-champs/pools");
  const anchor = String(form.get("anchor") ?? "").trim();
  const pairAScore = parseScore(form.get("pair_a_score"));
  const pairBScore = parseScore(form.get("pair_b_score"));
  const toRedirect = (path: string) => {
    const url = new URL(path, getBaseUrl(req));
    if (anchor) url.hash = anchor;
    return NextResponse.redirect(url, 303);
  };

  if (!id) {
    return toRedirect("/admin/club-champs/pools?error=Missing+match+id");
  }

  if (Number.isNaN(pairAScore) || Number.isNaN(pairBScore)) {
    return toRedirect("/admin/club-champs/pools?error=Scores+must+be+whole+numbers+or+blank");
  }

  const db = supabaseServer();
  const { data: updatedRow, error } = await db
    .from("club_champs_pool_matches")
    .update(
      pairAScore != null && pairBScore != null
        ? {
            pair_a_score: pairAScore,
            pair_b_score: pairBScore,
            is_playing: false,
          }
        : {
            pair_a_score: pairAScore,
            pair_b_score: pairBScore,
          }
    )
    .eq("id", id)
    .select("event")
    .single();

  if (error) {
    return toRedirect(`/admin/club-champs/pools?error=${encodeURIComponent(error.message)}`);
  }

  const event = String(updatedRow?.event ?? "").trim();
  if (event) {
    const { error: clearKnockoutError } = await db
      .from("club_champs_knockout_matches")
      .delete()
      .eq("event", event);
    if (clearKnockoutError) {
      return toRedirect(`/admin/club-champs/pools?error=${encodeURIComponent(clearKnockoutError.message)}`);
    }
  }

  return toRedirect(`${redirect}${redirect.includes("?") ? "&" : "?"}updated=1&knockout_reset=1`);
}
