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
  const pairAScore = parseScore(form.get("pair_a_score"));
  const pairBScore = parseScore(form.get("pair_b_score"));

  if (!id) {
    return NextResponse.redirect(
      new URL("/admin/club-champs/pools?error=Missing+match+id", getBaseUrl(req))
    );
  }

  if (Number.isNaN(pairAScore) || Number.isNaN(pairBScore)) {
    return NextResponse.redirect(
      new URL("/admin/club-champs/pools?error=Scores+must+be+whole+numbers+or+blank", getBaseUrl(req))
    );
  }

  const db = supabaseServer();
  const { error } = await db
    .from("club_champs_pool_matches")
    .update({
      pair_a_score: pairAScore,
      pair_b_score: pairBScore,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs/pools?error=${encodeURIComponent(error.message)}`, getBaseUrl(req))
    );
  }

  return NextResponse.redirect(
    new URL(`${redirect}${redirect.includes("?") ? "&" : "?"}updated=1`, getBaseUrl(req))
  );
}
