import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";
import { saveManualMember } from "@/lib/manual-member";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Forbidden" }, { status });
  }
  const body = await req.json().catch(() => ({}));
  const result = await saveManualMember(supabaseServer(), body);
  return NextResponse.json(result.body, { status: result.status });
}
