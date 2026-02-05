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
  const id = String(form.get("id") ?? "");
  const redirect = String(form.get("redirect") ?? "/admin/first-time");

  if (!id) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=Missing+id`, getBaseUrl(req))
    );
  }

  const db = supabaseServer();
  const { error } = await db.from("first_time_signups").delete().eq("id", id);

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=${encodeURIComponent(error.message)}`, getBaseUrl(req))
    );
  }

  return NextResponse.redirect(
    new URL(
      `${redirect}${redirect.includes("?") ? "&" : "?"}removed=1`,
      getBaseUrl(req)
    )
  );
}
