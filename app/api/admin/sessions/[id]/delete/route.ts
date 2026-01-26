import { NextRequest, NextResponse } from "next/server"; // access to coookies headers and url, only on server
import { supabaseServer } from "@/lib/supabase-server"; // server side supabase client
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

  if (!sessionId || sessionId === "undefined") {
    return NextResponse.json({ error: "Bad session id" }, { status: 400 });
  }

  const supabase = supabaseServer();

  await supabase.from("signups").delete().eq("session_id", sessionId);

  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL("/admin/sessions", req.url));
}
