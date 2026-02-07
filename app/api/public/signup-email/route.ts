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
    .select("id,session_id,status,name,email,student_id,cancel_token")
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

  let isFirstTimeTaster = false;
  if (!session.allow_name_only) {
    const emailNorm = signup.email.trim().toLowerCase();
    const studentNorm = (signup.student_id ?? "").trim().toLowerCase();
    const filters = [];
    if (emailNorm) filters.push(`email.eq.${emailNorm}`);
    if (studentNorm) filters.push(`student_id.eq.${studentNorm}`);

    if (filters.length > 0) {
      const { data: member } = await db
        .from("student_whitelist")
        .select("id")
        .or(filters.join(","))
        .maybeSingle();
      isFirstTimeTaster = !member;
    } else {
      isFirstTimeTaster = true;
    }
  }

  const { subject, text, html } = buildSignupEmail({
    name: signup.name ?? "",
    email: signup.email,
    status: signup.status as "signed_up" | "waiting_list",
    session,
    cancelUrl,
    isFirstTimeTaster,
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
