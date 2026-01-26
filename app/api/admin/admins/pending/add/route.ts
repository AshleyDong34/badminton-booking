import { NextRequest, NextResponse } from "next/server";
import { supabaseSSR } from "@/lib/supabase-ssr";
import { supabaseServer } from "@/lib/supabase-server";

async function isAdminFromSession() {
  const supa = await supabaseSSR();
  const { data } = await supa.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false as const };

  const { data: admin } = await supa
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { ok: !!admin };
}

export async function POST(req: NextRequest) {
  const guard = await isAdminFromSession();
  if (!guard.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Bad email" }, { status: 400 });
  }

  const db = supabaseServer();
  const { error } = await db
    .from("pending_admin_emails")
    .upsert({ email }, { onConflict: "email" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL("/admin/admins", req.url));
}
