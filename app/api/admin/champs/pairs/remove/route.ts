import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

export async function POST(req: NextRequest) {
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, getBaseUrl(req)), 303);

  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  const redirect = String(form.get("redirect") ?? "/admin/club-champs");

  if (!id) {
    return redirectTo(`/admin/club-champs?error=Missing+id`);
  }

  const db = supabaseServer();
  const { data: pair, error: pairLookupError } = await db
    .from("club_champs_pairs")
    .select("event")
    .eq("id", id)
    .single();
  if (pairLookupError || !pair?.event) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(pairLookupError?.message ?? "Pair not found")}`);
  }

  const { error } = await db.from("club_champs_pairs").delete().eq("id", id);

  if (error) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(error.message)}`);
  }

  const event = String(pair.event);
  const { error: resetPoolsError } = await db
    .from("club_champs_pool_matches")
    .delete()
    .eq("event", event);
  if (resetPoolsError) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(resetPoolsError.message)}`);
  }

  const { error: resetKnockoutError } = await db
    .from("club_champs_knockout_matches")
    .delete()
    .eq("event", event);
  if (resetKnockoutError) {
    return redirectTo(`/admin/club-champs?error=${encodeURIComponent(resetKnockoutError.message)}`);
  }

  return redirectTo(`${redirect}${redirect.includes("?") ? "&" : "?"}removed=1`);
}
