import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { buildCancellationEmail } from "@/lib/email-templates";
import {
  getEarliestWaitlistCandidate,
  sendPromotionEmailIfPromoted,
} from "@/lib/session-waitlist";

export const runtime = "nodejs";

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
  if (!signupId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = supabaseServer();

  const { data: signup, error: signupErr } = await supabase
    .from("signups")
    .select("id,session_id,status,name,email,cancel_token")
    .eq("id", signupId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (signupErr) return NextResponse.json({ error: signupErr.message }, { status: 500 });
  if (!signup) return NextResponse.json({ error: "Signup not found" }, { status: 404 });

  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("name,starts_at,ends_at,notes")
    .eq("id", sessionId)
    .single();

  const waitlistCandidate =
    signup.status === "signed_up"
      ? await getEarliestWaitlistCandidate(supabase, sessionId)
      : null;

  if (signup.cancel_token) {
    const { data, error } = await supabase.rpc("cancel_signup_by_token", {
      p_token: signup.cancel_token,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data !== true) {
      return NextResponse.json({ error: "Signup could not be removed." }, { status: 409 });
    }
  } else {
    const { error: delErr } = await supabase
      .from("signups")
      .delete()
      .eq("id", signupId)
      .eq("session_id", sessionId);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const baseUrl = getBaseUrl(req);
  const messages: string[] = ["Signup removed."];

  if (!sErr && session) {
    if (signup.email) {
      try {
        const { subject, text, html } = buildCancellationEmail({
          name: signup.name ?? "",
          session,
          previousStatus: signup.status as "signed_up" | "waiting_list",
          source: "admin_removed",
        });
        await sendEmail({
          to: signup.email,
          subject,
          text,
          html,
        });
      } catch (err) {
        messages.push(
          `Removal email failed: ${
            err instanceof Error ? err.message : "unknown email error"
          }`
        );
      }
    }

    const promotion = await sendPromotionEmailIfPromoted({
      db: supabase,
      candidate: waitlistCandidate,
      session,
      baseUrl,
    });

    if (promotion.promoted) {
      messages.push(
        promotion.emailSent
          ? "Next waitlisted person was promoted and emailed."
          : `Next waitlisted person was promoted, but email was not sent: ${
              promotion.emailError ?? "unknown email error"
            }`
      );
    }
  }

  const url = new URL(`/admin/sessions/${sessionId}`, baseUrl);
  url.searchParams.set(
    "capacityStatus",
    messages.some((message) => message.includes("failed") || message.includes("not sent"))
      ? "error"
      : "success"
  );
  url.searchParams.set("capacityMessage", messages.join(" "));

  return NextResponse.redirect(url, { status: 303 });
}
