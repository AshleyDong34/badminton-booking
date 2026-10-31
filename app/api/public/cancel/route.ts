import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { buildCancellationEmail } from "@/lib/email-templates";
import { getBookingCredits } from "@/lib/booking-credits";
import { getWaitlistCandidates, sendPromotionEmailIfPromoted } from "@/lib/session-waitlist";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json({ status: "invalid" }, { status: 200 });
  }

  const db = supabaseServer();
  const { data: signup, error } = await db
    .from("signups")
    .select("id,session_id,status")
    .eq("cancel_token", token)
    .maybeSingle();

  if (error || !signup) {
    return NextResponse.json({ status: "invalid" }, { status: 200 });
  }

  const { data: session, error: sessionError } = await db.from("sessions")
    .select("starts_at").eq("id", signup.session_id).maybeSingle();
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
  if (session?.starts_at && new Date(session.starts_at).getTime() <= Date.now()) {
    return NextResponse.json({ status: "expired" }, { status: 200 });
  }

  const isCancellable =
    signup.status === "signed_up" || signup.status === "waiting_list";

  return NextResponse.json(
    { status: isCancellable ? "ready" : "invalid" },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: signup, error: signupErr } = await db
    .from("signups")
    .select("id,session_id,status,name,email,student_id,is_taster,created_at,cancel_token")
    .eq("cancel_token", token)
    .single();

  if (signupErr || !signup) {
    return NextResponse.json({ status: "invalid" }, { status: 200 });
  }

  const { data: session } = await db
    .from("sessions")
    .select("name,starts_at,ends_at,notes")
    .eq("id", signup.session_id)
    .single();

  if (session?.starts_at && new Date(session.starts_at).getTime() <= Date.now()) {
    return NextResponse.json({ status: "expired" }, { status: 200 });
  }

  const waitlistCandidates = signup.status === "signed_up"
    ? await getWaitlistCandidates(db, signup.session_id)
    : [];

  const { data, error } = await db.rpc("cancel_signup_by_token", {
    p_token: token,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Cancel failed." },
      { status: 500 }
    );
  }

  if (data !== true) {
    return NextResponse.json({
      status: session?.starts_at && new Date(session.starts_at).getTime() <= Date.now()
        ? "expired" : "invalid",
    }, { status: 200 });
  }

  if (session && signup.email) {
    try {
      const { data: spentCredit, error: spendError } = await db.from("booking_credit_spends")
        .select("signup_id").eq("signup_id", signup.id).maybeSingle();
      if (spendError) throw spendError;
      const { subject, text, html } = buildCancellationEmail({
        name: signup.name ?? "",
        session,
        previousStatus: signup.status as "signed_up" | "waiting_list",
        source: "user_cancelled",
        isFirstTimeTaster: signup.is_taster,
        creditReturned: !spentCredit,
        credits: await getBookingCredits(db, signup),
      });
      await sendEmail({
        to: signup.email,
        subject,
        text,
        html,
      });
    } catch {
      // Best-effort email; do not fail cancellation.
    }
  }

  let promoted = false;
  if (session) {
    for (const candidate of waitlistCandidates) {
      const result = await sendPromotionEmailIfPromoted({
        db, candidate, session, baseUrl: getBaseUrl(req),
      });
      if (result.promoted) {
        promoted = true;
        break;
      }
    }
  }

  return NextResponse.json({ status: "ok", promoted });
}
