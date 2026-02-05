import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";

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
  const body = await req.json().catch(() => ({}));
  const signupId = typeof body.signupId === "string" ? body.signupId : "";
  const attended = typeof body.attended === "boolean" ? body.attended : null;

  if (!sessionId || !signupId || attended === null) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const db = supabaseServer();
  const { error } = await db
    .from("signups")
    .update({ attended })
    .eq("id", signupId)
    .eq("session_id", sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
