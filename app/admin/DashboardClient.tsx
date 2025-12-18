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

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sessions.map((s) => {
        const isFull = s.signed_up_count >= s.capacity;

        return (
          <div key={s.id} className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{s.name}</div>
                <div className="text-sm opacity-70">{isFull ? "FULL" : "Spaces available"}</div>
              </div>
              <Link className="underline" href={`/admin/sessions/${s.id}`}>
                Manage
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3">
                <div className="text-sm opacity-70">Signed up</div>
                <div className="text-xl font-semibold">
                  {s.signed_up_count}/{s.capacity}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-sm opacity-70">Waitlist</div>
                <div className="text-xl font-semibold">{s.waiting_list_count}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
