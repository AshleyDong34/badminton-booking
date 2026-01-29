import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import DeleteSessionButton from "./DeleteSessionButton";


// Always fetch fresh data for admin pages (no caching).
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  name: string;
  capacity: number;
  signed_up_count: number;
  waiting_list_count: number;
};

export default async function SessionsPage() {
  const supabase = supabaseServer();

  // Pull from the VIEW so we get counts in one query.
  const { data, error } = await supabase
    .from("admin_session_overview")
    .select("id,name,capacity,signed_up_count,waiting_list_count")
    .order("name", { ascending: true });

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

  const sessions = (data ?? []) as Row[];

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
              const statusClass = isFull
                ? "bg-[var(--accent)] text-[var(--ink)]"
                : "bg-[var(--ok)] text-white";

              return (
                <tr
                  key={s.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
                >
                  <td className="py-3 px-4 font-medium">{s.name}</td>
                  <td className="py-3 px-4">{s.capacity}</td>
                  <td className="py-3 px-4">
                    {s.signed_up_count}/{s.capacity}
                  </td>
                  <td className="py-3 px-4">{s.waiting_list_count}</td>
                  <td className="py-3 px-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                      {isFull ? "FULL" : "OPEN"}
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
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            No sessions yet. Create one using "New session".
          </p>
        )}
      </div>
    </div>
  );
}
