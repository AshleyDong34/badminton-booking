import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

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
  const { error: delErr } = await supabase
    .from("signups")
    .delete()
    .eq("id", signupId)
    .eq("session_id", sessionId);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Auto-promote earliest waitlisted if there is now capacity
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("capacity")
    .eq("id", sessionId)
    .single();

  if (!sErr && session) {
    const { count: signedUpCount } = await supabase
      .from("signups")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "signed_up");

    if ((signedUpCount ?? 0) < session.capacity) {
      const { data: nextWaiter } = await supabase
        .from("signups")
        .select("id")
        .eq("session_id", sessionId)
        .eq("status", "waiting_list")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextWaiter?.id) {
        await supabase
          .from("signups")
          .update({ status: "signed_up" })
          .eq("id", nextWaiter.id)
          .eq("session_id", sessionId);
      }
    }
  }

  return NextResponse.redirect(
    new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req))
  );
}
