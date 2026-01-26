import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";

function isValidEmail(email: string) {
  return email.includes("@");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawEmail = typeof body.email === "string" ? body.email : "";
  const email = rawEmail.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: pending, error: pendingErr } = await db
    .from("pending_admin_emails")
    .select("email")
    .ilike("email", email)
    .maybeSingle();

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 });
  }

  let isAllowed = Boolean(pending);

  if (!isAllowed) {
    const { data: authUser, error: authErr } = await db
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    if (authUser?.id) {
      const { data: admin, error: adminErr } = await db
        .from("admins")
        .select("user_id")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (adminErr) {
        return NextResponse.json({ error: adminErr.message }, { status: 500 });
      }

      isAllowed = Boolean(admin);
    }
  }

  if (!isAllowed) {
    return NextResponse.json(
      { error: "This email is not authorized for admin access." },
      { status: 403 }
    );
  }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const redirectTo = new URL("/auth/callback", req.url).toString();

  const { error: sendErr } = await authClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (sendErr) {
    return NextResponse.json({ error: sendErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Magic link sent. Check your inbox (and Junk).",
  });
}
