import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdminRoute } from "@/lib/requireAdminRoute";

export async function POST(req: NextRequest) {
  const guard = await requireAdminRoute(req);
  if (!guard.ok) return guard.res;

  const form = await req.formData();

  const weekly_quota = Number(form.get("weekly_quota")); // <-- rename if needed
  const allow_same_day_multi = String(form.get("allow_same_day_multi")) === "true";

  if (!Number.isFinite(weekly_quota) || weekly_quota < 1) {
    return new NextResponse("Bad weekly quota", { status: 400 });
  }

  const supabase = supabaseServer();

  // single-row settings table (id=1)
  const { error } = await supabase
    .from("settings")
    .upsert(
      { id: 1, weekly_quota, allow_same_day_multi },
      { onConflict: "id" }
    );

  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.redirect(new URL("/admin/settings", req.url));
}
