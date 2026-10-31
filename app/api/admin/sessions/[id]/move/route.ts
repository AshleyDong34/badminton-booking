import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { sendPromotionEmailIfPromoted } from "@/lib/session-waitlist";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const { id: sessionId } = await ctx.params;

  const form = await req.formData();
  const signupId = String(form.get("signupId") ?? "");
  const toStatus = String(form.get("toStatus") ?? "");

  if (!signupId || (toStatus !== "signed_up" && toStatus !== "waiting_list")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: signup, error: signupError } = await supabase
    .from("signups")
    .select("id,session_id,status,name,email,student_id,created_at,cancel_token")
    .eq("id", signupId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (signupError) return NextResponse.json({ error: signupError.message }, { status: 500 });
  if (!signup) return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  if (signup.status === toStatus) {
    return NextResponse.redirect(new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req)), { status: 303 });
  }

  let promotionSession: { name: string; starts_at: string | null; ends_at: string | null; notes: string | null } | null = null;

  // Enforce capacity if promoting to signed_up
  if (toStatus === "signed_up") {
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("capacity,name,starts_at,ends_at,notes")
      .eq("id", sessionId)
      .single();

    if (sErr || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    promotionSession = session;

    const { count: signedUpCount, error: cErr } = await supabase
      .from("signups")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "signed_up");

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    if ((signedUpCount ?? 0) >= session.capacity) {
      return NextResponse.redirect(
        new URL(`/admin/sessions/${sessionId}?error=full`, getBaseUrl(req))
      );
    }
  }

  // Update signup status (must belong to session)
  const { data: updated, error: upErr } = await supabase
    .from("signups")
    .update({ status: toStatus })
    .eq("id", signupId)
    .eq("session_id", sessionId)
    .eq("status", signup.status)
    .select("id")
    .maybeSingle();

  if (upErr) {
    if (/weekly limit reached/i.test(upErr.message)) {
      const url = new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req));
      url.searchParams.set("capacityStatus", "error");
      url.searchParams.set("capacityMessage", "This person has no booking credit available for the week they joined the waitlist.");
      return NextResponse.redirect(url, { status: 303 });
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "Signup changed while updating. Refresh and try again." }, { status: 409 });

  if (toStatus === "signed_up" && promotionSession) {
    const promotion = await sendPromotionEmailIfPromoted({
      db: supabase, candidate: signup, session: promotionSession, baseUrl: getBaseUrl(req),
    });
    if (!promotion.emailSent) {
      const url = new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req));
      url.searchParams.set("capacityStatus", "error");
      url.searchParams.set("capacityMessage", `Person promoted, but the email was not sent: ${promotion.emailError ?? "booking status changed before email delivery"}.`);
      return NextResponse.redirect(url, { status: 303 });
    }
  }

  return NextResponse.redirect(
    new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req)),
    { status: 303 }
  );
}
