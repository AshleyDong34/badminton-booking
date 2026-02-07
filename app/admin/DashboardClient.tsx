"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Row = {
  id: string;
  name: string;
  capacity: number;
  signed_up_count: number;
  waiting_list_count: number;
  starts_at: string | null;
  ends_at: string | null;
};

async function fetchOverview(): Promise<Row[]> {
  const res = await fetch("/api/admin/overview", { cache: "no-store" });
  const json = await res.json();
  return json.sessions ?? [];
}

export default function DashboardClient({ initial }: { initial: Row[] }) {
  const [sessions, setSessions] = useState<Row[]>(initial);

  useEffect(() => {
    // Subscribe to DB changes (realtime). When anything changes, refetch overview.
    const channel = supabase
      .channel("admin-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signups" },
        async () => setSessions(await fetchOverview())
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        async () => setSessions(await fetchOverview())
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const now = new Date();
  const isPast = (s: Row) => {
    const end = s.ends_at ?? s.starts_at;
    if (!end) return false;
    return new Date(end) < now;
  };

  const currentSessions = sessions.filter((s) => !isPast(s));
  const pastSessions = sessions.filter((s) => isPast(s));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Current & upcoming</h2>
        <p className="text-sm text-[var(--muted)]">
          Live sessions and upcoming bookings.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {currentSessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </div>
      {currentSessions.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No upcoming sessions.</p>
      )}

      <div>
        <h2 className="text-lg font-semibold">Past sessions</h2>
        <p className="text-sm text-[var(--muted)]">
          Past sessions remain visible for attendance history.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pastSessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </div>
      {pastSessions.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No past sessions yet.</p>
      )}
    </div>
  );
}

function SessionCard({ session: s }: { session: Row }) {
  const isFull = s.signed_up_count >= s.capacity;
  const statusLabel = isFull ? "Full" : "Open";
  const statusClass = isFull
    ? "bg-[var(--accent)] text-[var(--ink)]"
    : "bg-[var(--ok)] text-white";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold leading-snug">{s.name}</div>
          <div className="mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
            <span className={`rounded-full px-2.5 py-1 ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        <Link
          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm transition hover:translate-y-[-1px]"
          href={`/admin/sessions/${s.id}`}
        >
          Manage
        </Link>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
          <div className="text-xs text-[var(--muted)]">Signed up</div>
          <div className="text-xl font-semibold">
            {s.signed_up_count}/{s.capacity}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
          <div className="text-xs text-[var(--muted)]">Waitlist</div>
          <div className="text-xl font-semibold">{s.waiting_list_count}</div>
        </div>
      </div>
    </div>
  );
}
