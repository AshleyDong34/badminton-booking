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
    const { data: adminIds, error: adminIdsErr } = await db
      .from("admins")
      .select("user_id");

    if (adminIdsErr) {
      return NextResponse.json({ error: adminIdsErr.message }, { status: 500 });
    }

    for (const row of adminIds ?? []) {
      const { data: adminUser, error: adminUserErr } = await db.auth.admin.getUserById(
        row.user_id
      );

      if (adminUserErr) {
        return NextResponse.json({ error: adminUserErr.message }, { status: 500 });
      }

      const adminEmail = adminUser.user?.email?.toLowerCase();
      if (adminEmail === email) {
        isAllowed = true;
        break;
      }
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
  const redirectTo = new URL("/signin", req.url).toString();

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
