import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const redirectPath = String(form.get("redirect") ?? "/admin/club-champs/finalize");
  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(`${redirectPath}?error=${encodeURIComponent(message)}`, getBaseUrl(req))
    );

  const db = supabaseServer();

  const { error: clearKnockoutError } = await db
    .from("club_champs_knockout_matches")
    .delete()
    .gte("stage", 1);
  if (clearKnockoutError) return fail(clearKnockoutError.message);

  const { error: clearPoolsError } = await db
    .from("club_champs_pool_matches")
    .delete()
    .gte("pool_number", 1);
  if (clearPoolsError) return fail(clearPoolsError.message);

  const { error: clearPairsError } = await db
    .from("club_champs_pairs")
    .delete()
    .not("id", "is", null);
  if (clearPairsError) return fail(clearPairsError.message);

  const { error: settingsError } = await db
    .from("settings")
    .update({
      club_champs_public_enabled: false,
      club_champs_pairs_only_public: false,
    })
    .eq("id", 1);
  if (settingsError) return fail(settingsError.message);

  return NextResponse.redirect(
    new URL(`${redirectPath}?done=1`, getBaseUrl(req))
  );
}
