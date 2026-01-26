import { NextRequest, NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabase-ssr";

export async function requireAdminRoute(req: NextRequest) {
  const supabase = await supabaseSSR();

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const, user };
}
