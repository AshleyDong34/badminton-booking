import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { buildSignupEmail } from "@/lib/email-templates";
import { getBookingCredits } from "@/lib/booking-credits";

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
    .select("id,session_id,status,name,email,student_id,created_at,cancel_token")
    .eq("cancel_token", cancelToken)
    .single();

  if (signupErr || !signup || !signup.email) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("name,starts_at,ends_at,notes,allow_name_only")
    .eq("id", signup.session_id)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const baseUrl = getBaseUrl(req);
  const cancelUrl = `${baseUrl}/cancel?token=${signup.cancel_token}`;

  const { data: taster } = session.allow_name_only
    ? { data: null }
    : await db.from("first_time_signups")
        .select("id")
        .eq("email", signup.email.trim().toLowerCase())
        .eq("created_at", signup.created_at)
        .maybeSingle();
  const isFirstTimeTaster = Boolean(taster);
  const credits = await getBookingCredits(db, signup);

  const { subject, text, html } = buildSignupEmail({
    name: signup.name ?? "",
    email: signup.email,
    status: signup.status as "signed_up" | "waiting_list",
    session,
    cancelUrl,
    isFirstTimeTaster,
    credits,
  });

  try {
    await sendEmail({ to: signup.email, subject, text, html });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
