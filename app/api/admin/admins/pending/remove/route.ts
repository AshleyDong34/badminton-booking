import { NextRequest, NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabase-ssr";
import { supabaseServer } from "@/lib/supabase-server";

async function isAdminFromSession() {
  const supa = await supabaseSSR();
  const { data } = await supa.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false as const, userId: null as string | null };

  const { data: admin } = await supa
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { ok: !!admin, userId: user.id };
}

export async function POST(req: NextRequest) {
  const guard = await isAdminFromSession();
  if (!guard.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const user_id = String(form.get("user_id") ?? "").trim();

  if (!user_id || user_id === "undefined") {
    return NextResponse.json({ error: "Bad user_id" }, { status: 400 });
  }

  // Prevent removing yourself (optional safety)
  if (guard.userId && user_id === guard.userId) {
    return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
  }

  const db = supabaseServer();
  const { error } = await db.from("admins").delete().eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL("/admin/admins", req.url));
}
