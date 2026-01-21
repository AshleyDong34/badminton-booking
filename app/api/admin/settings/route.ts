import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const isAdmin = cookieStore.get("admin_dev")?.value === "1";
  if (!isAdmin) return new NextResponse("Not an admin", { status: 403 });

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
