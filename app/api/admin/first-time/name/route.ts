import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/base-url";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden" },
      { status: guard.reason === "not_logged_in" ? 401 : 403 }
    );
  }

  const form = await req.formData();
  const id = String(form.get("id") ?? "").trim();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const base = getBaseUrl(req);
  if (!id || !name || name.length > 160) {
    return NextResponse.redirect(new URL("/admin/first-time?error=Enter+a+valid+name", base));
  }
  const { error } = await supabaseServer().from("first_time_signups").update({ name }).eq("id", id);
  if (error) {
    return NextResponse.redirect(new URL(`/admin/first-time?error=${encodeURIComponent(error.message)}`, base));
  }
  return NextResponse.redirect(new URL("/admin/first-time?ok=1", base));
}
