import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Forbidden" }, { status });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Confirmation and current member count are required." }, { status: 400 });
  }
  const expectedCount = body.expectedCount;
  if (
    body.confirmation !== "CLEAR MEMBERSHIP" ||
    !Number.isSafeInteger(expectedCount) ||
    expectedCount < 1
  ) {
    return NextResponse.json({ error: "Confirmation and current member count are required." }, { status: 400 });
  }

  const { data, error } = await supabaseServer().rpc("clear_membership_roster", {
    p_expected_count: expectedCount,
  });
  if (error) {
    const changed = error.message.includes("membership list changed");
    return NextResponse.json(
      { error: changed ? "The membership list changed. Refresh and confirm again." : "Could not clear the membership list." },
      { status: changed ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, removed: data });
}
