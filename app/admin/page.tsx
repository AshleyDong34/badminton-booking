import DashboardClient from "./DashboardClient";
import { supabaseServer } from "@/lib/supabase-server";


type Row = {
  id: string;
  name: string;
  capacity: number;
  signed_up_count: number;
  waiting_list_count: number;
  starts_at: string | null;
  ends_at: string | null;
};

export default async function AdminHome() {
  const supabase = supabaseServer();

  const { data: sessions, error: sessionsErr } = await supabase
    .from("sessions")
    .select("id,name,capacity,starts_at,ends_at")
    .order("starts_at", { ascending: true });

  if (sessionsErr) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm opacity-80">Failed to load: {sessionsErr.message}</p>
      </div>
    );
  }

  const rows = (sessions ?? []) as Row[];
  const ids = rows.map((s) => s.id);
  const counts = new Map<string, { signed: number; waitlist: number }>();

  if (ids.length > 0) {
    const { data: signups, error: signupsErr } = await supabase
      .from("signups")
      .select("session_id,status")
      .in("session_id", ids);

    if (signupsErr) {
      return (
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm opacity-80">Failed to load: {signupsErr.message}</p>
        </div>
      );
    }

    for (const row of signups ?? []) {
      const current = counts.get(row.session_id) ?? { signed: 0, waitlist: 0 };
      if (row.status === "signed_up") current.signed += 1;
      if (row.status === "waiting_list") current.waitlist += 1;
      counts.set(row.session_id, current);
    }
  }

  const initial = rows.map((s) => {
    const current = counts.get(s.id) ?? { signed: 0, waitlist: 0 };
    return {
      ...s,
      signed_up_count: current.signed,
      waiting_list_count: current.waitlist,
    };
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[var(--muted)]">
          Live overview of session capacity and waitlist status.
        </p>
      </div>
      <DashboardClient initial={initial} />
    </div>
  );
}
