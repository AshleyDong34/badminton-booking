import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { buildSignupEmail } from "@/lib/email-templates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cancelToken = typeof body.cancelToken === "string" ? body.cancelToken : "";

  if (!cancelToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const db = supabaseServer();
  const { data: signup, error: signupErr } = await db
    .from("signups")
    .select("id,session_id,status,name,email,cancel_token")
    .eq("cancel_token", cancelToken)
    .single();

  if (signupErr || !signup || !signup.email) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("name,starts_at,ends_at,notes")
    .eq("id", signup.session_id)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const baseUrl = getBaseUrl(req);
  const cancelUrl = `${baseUrl}/cancel?token=${signup.cancel_token}`;

  const { subject, text, html } = buildSignupEmail({
    name: signup.name ?? "",
    email: signup.email,
    status: signup.status as "signed_up" | "waiting_list",
    session,
    cancelUrl,
  });

  try {
    await sendEmail({ to: signup.email, subject, text, html });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Email failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
