import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type SignupRow = {
  session_id: string;
  status: "signed_up" | "waiting_list";
};

export async function GET() {
  const db = supabaseServer();
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const weekAheadIso = weekAhead.toISOString();

  const { data: sessions, error: sessionsErr } = await db
    .from("sessions")
    .select("id,name,capacity,starts_at,ends_at,notes")
    .not("starts_at", "is", null)
    .lte("starts_at", weekAheadIso)
    .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
    .order("starts_at", { ascending: true });

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  }

  const ids = (sessions ?? []).map((s) => s.id);
  const counts = new Map<string, { signed: number; waitlist: number }>();

  if (ids.length > 0) {
    const { data: signups, error: signupsErr } = await db
      .from("signups")
      .select("session_id,status")
      .in("session_id", ids);

    if (signupsErr) {
      return NextResponse.json({ error: signupsErr.message }, { status: 500 });
    }

    for (const row of (signups ?? []) as SignupRow[]) {
      const current = counts.get(row.session_id) ?? { signed: 0, waitlist: 0 };
      if (row.status === "signed_up") current.signed += 1;
      if (row.status === "waiting_list") current.waitlist += 1;
      counts.set(row.session_id, current);
    }
  }

  const enriched = (sessions ?? []).map((session) => {
    const current = counts.get(session.id) ?? { signed: 0, waitlist: 0 };
    return {
      ...session,
      signed_up_count: current.signed,
      waitlist_count: current.waitlist,
    };
  });

  return NextResponse.json({ sessions: enriched });
}
