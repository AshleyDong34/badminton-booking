import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  // Server endpoint (API route): runs on server, can use service role key safely.
  const supabase = supabaseServer();

  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select("id,name,capacity,starts_at,ends_at")
    .order("starts_at", { ascending: true });

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  }

  const rows = (sessions ?? []) as {
    id: string;
    name: string;
    capacity: number;
    starts_at: string | null;
    ends_at: string | null;
  }[];

  const ids = rows.map((s) => s.id);
  const counts = new Map<string, { signed: number; waitlist: number }>();

  if (ids.length > 0) {
    const { data: signups, error: signupsErr } = await supabase
      .from("signups")
      .select("session_id,status")
      .in("session_id", ids);

    if (signupsErr) {
      return NextResponse.json({ error: signupsErr.message }, { status: 500 });
    }

    for (const row of signups ?? []) {
      const current = counts.get(row.session_id) ?? { signed: 0, waitlist: 0 };
      if (row.status === "signed_up") current.signed += 1;
      if (row.status === "waiting_list") current.waitlist += 1;
      counts.set(row.session_id, current);
    }
  }

  const enriched = rows.map((s) => {
    const current = counts.get(s.id) ?? { signed: 0, waitlist: 0 };
    return {
      ...s,
      signed_up_count: current.signed,
      waiting_list_count: current.waitlist,
    };
  });

  return NextResponse.json({ sessions: enriched }, { status: 200 });
}
