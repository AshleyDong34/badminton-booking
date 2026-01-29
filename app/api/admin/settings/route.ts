import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();

  const weekly_quota = Number(form.get("weekly_quota")); // <-- rename if needed
  const allow_same_day_multi = String(form.get("allow_same_day_multi")) === "true";
  const allow_name_only = form.get("allow_name_only") === "on";

  if (!Number.isFinite(weekly_quota) || weekly_quota < 1) {
    return new NextResponse("Bad weekly quota", { status: 400 });
  }

  const supabase = supabaseServer();

  // single-row settings table (id=1)
  const payload = { id: 1, weekly_quota, allow_same_day_multi, allow_name_only };
  let { error } = await supabase
    .from("settings")
    .upsert(payload, { onConflict: "id" });

  if (error && error.message.includes("allow_name_only")) {
    const fallback = await supabase
      .from("settings")
      .upsert({ id: 1, weekly_quota, allow_same_day_multi }, { onConflict: "id" });
    error = fallback.error;
  }

  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.redirect(new URL("/admin/settings", req.url));
}
