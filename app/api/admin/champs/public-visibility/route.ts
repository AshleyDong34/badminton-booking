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
  const clubChampsPublicEnabled = form.get("club_champs_public_enabled") === "on";
  const redirect = "/admin/club-champs";

  const db = supabaseServer();
  const { error } = await db
    .from("settings")
    .upsert(
      {
        id: 1,
        club_champs_public_enabled: clubChampsPublicEnabled,
      },
      { onConflict: "id" }
    );

  if (error) {
    const message = encodeURIComponent(
      error.message.includes("club_champs_public_enabled")
        ? "Missing settings column club_champs_public_enabled. Run: alter table public.settings add column if not exists club_champs_public_enabled boolean not null default false;"
        : error.message
    );
    return NextResponse.redirect(new URL(`${redirect}?error=${message}`, getBaseUrl(req)));
  }

  return NextResponse.redirect(new URL(`${redirect}?visibility_saved=1`, getBaseUrl(req)));
}
