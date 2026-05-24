import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/email";
import { buildCancellationEmail, buildPromotionEmail } from "@/lib/email-templates";

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

  // Delete signup row (must belong to session)
  const { data: deleted, error: delErr } = await supabase
    .from("signups")
    .delete()
    .eq("id", signupId)
    .eq("session_id", sessionId)
    .select("id,status,name,email")
    .maybeSingle();

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "Signup not found" }, { status: 404 });

  // Auto-promote earliest waitlisted if there is now capacity
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("capacity,name,starts_at,ends_at,notes")
    .eq("id", sessionId)
    .single();

  if (!sErr && session) {
    if (deleted.email) {
      try {
        const { subject, text, html } = buildCancellationEmail({
          name: deleted.name ?? "",
          session,
          previousStatus: deleted.status as "signed_up" | "waiting_list",
          source: "admin_removed",
        });
        await sendEmail({
          to: deleted.email,
          subject,
          text,
          html,
        });
      } catch {
        // Best-effort email; do not fail the admin removal.
      }
    }

    if (deleted.status === "signed_up") {
      const { count: signedUpCount } = await supabase
        .from("signups")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("status", "signed_up");

      if ((signedUpCount ?? 0) < session.capacity) {
        const { data: nextWaiter } = await supabase
          .from("signups")
          .select("id,name,email,cancel_token")
          .eq("session_id", sessionId)
          .eq("status", "waiting_list")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (nextWaiter?.id) {
          const { data: promoted } = await supabase
            .from("signups")
            .update({ status: "signed_up" })
            .eq("id", nextWaiter.id)
            .eq("session_id", sessionId)
            .select("id,name,email,cancel_token,status")
            .maybeSingle();

          if (
            promoted?.status === "signed_up" &&
            promoted.email &&
            promoted.cancel_token
          ) {
            try {
              const baseUrl = getBaseUrl(req);
              const cancelUrl = `${baseUrl}/cancel?token=${promoted.cancel_token}`;
              const { subject, text, html } = buildPromotionEmail({
                name: promoted.name ?? "",
                session,
                cancelUrl,
              });
              await sendEmail({
                to: promoted.email,
                subject,
                text,
                html,
              });
            } catch {
              // Best-effort email; do not fail the admin removal.
            }
          }
        }
      }
    }
  }

  return NextResponse.redirect(
    new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req))
  );
}
