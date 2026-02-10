import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import DeleteSessionButton from "./DeleteSessionButton";
import PastSessionsTable from "./PastSessionsTable";
import { formatAdminSessionDateRange } from "@/lib/format-session-datetime";


// Always fetch fresh data for admin pages (no caching).
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  name: string;
  capacity: number;
  signed_up_count: number;
  waiting_list_count: number;
  starts_at: string | null;
  ends_at: string | null;
};

export default async function SessionsPage() {
  const supabase = supabaseServer();

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id,name,capacity,starts_at,ends_at")
    .order("starts_at", { ascending: true });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-sm text-[var(--muted)]">
          Failed to load sessions: {error.message}
        </p>
        <Link
          href="/admin/sessions/new"
          className="inline-block rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          New session
        </Link>
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
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <p className="text-sm text-[var(--muted)]">
            Failed to load sessions: {signupsErr.message}
          </p>
          <Link
            href="/admin/sessions/new"
            className="inline-block rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            New session
          </Link>
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

  const enriched = rows.map((s) => {
    const current = counts.get(s.id) ?? { signed: 0, waitlist: 0 };
    return {
      ...s,
      signed_up_count: current.signed,
      waiting_list_count: current.waitlist,
    };
  });

  const now = new Date();
  const isPast = (s: Row) => {
    const end = s.ends_at ?? s.starts_at;
    if (!end) return false;
    return new Date(end) < now;
  };

  const currentSessions = enriched.filter((s) => !isPast(s));
  const pastSessions = enriched.filter((s) => isPast(s));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <p className="text-sm text-[var(--muted)]">
            Manage capacity, waitlists, and edits for each session.
          </p>
        </div>
        <Link
          href="/admin/sessions/new"
          className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          New session
        </Link>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Current & upcoming sessions</h2>
          <p className="text-sm text-[var(--muted)]">
            These sessions are visible to players. Past sessions are moved below.
          </p>
        </div>
        <SessionTable sessions={currentSessions} emptyText="No upcoming sessions." />

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Past sessions</h2>
          <p className="text-sm text-[var(--muted)]">
            Past sessions are hidden from the public landing page but remain for attendance
            history until they are deleted.
          </p>
        </div>
        <PastSessionsTable sessions={pastSessions} />
      </div>
    </div>
  );
}

function SessionTable({
  sessions,
  emptyText,
}: {
  sessions: Row[];
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-[var(--line)]">
          <tr className="text-left text-[var(--muted)]">
            <th className="py-3 px-4">Session</th>
            <th className="py-3 px-4">Capacity</th>
            <th className="py-3 px-4">Signed up</th>
            <th className="py-3 px-4">Waiting list</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, idx) => {
            const isFull = s.signed_up_count >= s.capacity;
            const end = s.ends_at ?? s.starts_at;
            const isPast = end ? new Date(end) < new Date() : false;
            const statusClass = isPast
              ? "bg-[var(--line)] text-[var(--muted)]"
              : isFull
              ? "bg-[var(--accent)] text-[var(--ink)]"
              : "bg-[var(--ok)] text-white";

            const statusLabel = isPast ? "ENDED" : isFull ? "FULL" : "OPEN";

            return (
              <tr
                key={s.id}
                className={idx % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
              >
                <td className="py-3 px-4">
                  <div className="font-medium">{s.name}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {formatAdminSessionDateRange(s.starts_at, s.ends_at)}
                  </div>
                </td>
                <td className="py-3 px-4">{s.capacity}</td>
                <td className="py-3 px-4">
                  {s.signed_up_count}/{s.capacity}
                </td>
                <td className="py-3 px-4">{s.waiting_list_count}</td>
                <td className="py-3 px-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                    {statusLabel}
                  </span>
                </td>
                <td className="py-3 px-4 space-x-2">
                  <Link
                    className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm transition hover:translate-y-[-1px]"
                    href={`/admin/sessions/${s.id}`}
                  >
                    Manage
                  </Link>
                  <Link
                    className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm transition hover:translate-y-[-1px]"
                    href={`/admin/sessions/${s.id}/attendance`}
                  >
                    Attendance
                  </Link>
                  <DeleteSessionButton id={s.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sessions.length === 0 && (
        <p className="px-4 py-6 text-sm text-[var(--muted)]">{emptyText}</p>
      )}
    </div>
  );
}
