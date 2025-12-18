import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isAdmin } from "@/lib/adminGuard";

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await ctx.params;

  const form = await req.formData();
  const signupId = String(form.get("signupId") ?? "");
  const toStatus = String(form.get("toStatus") ?? "");

  if (!signupId || (toStatus !== "signed_up" && toStatus !== "waiting_list")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Enforce capacity if promoting to signed_up
  if (toStatus === "signed_up") {
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("capacity")
      .eq("id", sessionId)
      .single();

    if (sErr || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const { count: signedUpCount, error: cErr } = await supabase
      .from("signups")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "signed_up");

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

    if ((signedUpCount ?? 0) >= session.capacity) {
      return NextResponse.redirect(new URL(`/admin/sessions/${sessionId}?error=full`, req.url));
    }
  }

  // Update signup status (must belong to session)
  const { error: upErr } = await supabase
    .from("signups")
    .update({ status: toStatus })
    .eq("id", signupId)
    .eq("session_id", sessionId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.redirect(new URL(`/admin/sessions/${sessionId}`, req.url));
}
