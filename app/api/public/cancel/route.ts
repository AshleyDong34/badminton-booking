import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { buildPromotionEmail } from "@/lib/email-templates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const db = supabaseServer();

  const { data: signup, error: signupErr } = await db
    .from("signups")
    .select("id,session_id,name,email,cancel_token")
    .eq("cancel_token", token)
    .single();

  if (signupErr || !signup) {
    return NextResponse.json({ status: "invalid" }, { status: 200 });
  }

  const { data: waitlistCandidate } = await db
    .from("signups")
    .select("id,name,email,status,cancel_token")
    .eq("session_id", signup.session_id)
    .eq("status", "waiting_list")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

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
    return NextResponse.json({ status: "invalid" }, { status: 200 });
  }

  let promoted = false;
  if (waitlistCandidate?.id) {
    const { data: promotedRow } = await db
      .from("signups")
      .select("status")
      .eq("id", waitlistCandidate.id)
      .maybeSingle();

    if (promotedRow?.status === "signed_up") {
      promoted = true;

      const { data: session } = await db
        .from("sessions")
        .select("name,starts_at,ends_at,notes")
        .eq("id", signup.session_id)
        .single();

      if (session && waitlistCandidate.email && waitlistCandidate.cancel_token) {
        const baseUrl = getBaseUrl(req);
        const cancelUrl = `${baseUrl}/cancel?token=${waitlistCandidate.cancel_token}`;

        try {
          const { subject, text, html } = buildPromotionEmail({
            name: waitlistCandidate.name ?? "",
            session,
            cancelUrl,
          });
          await sendEmail({
            to: waitlistCandidate.email,
            subject,
            text,
            html,
          });
        } catch {
          // Best-effort email; do not fail cancellation.
        }
      }
    }
  }

  return NextResponse.json({ status: "ok", promoted });
}
