import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

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
        <p className="text-sm opacity-80">Failed to load sessions: {error.message}</p>
        <Link href="/admin/sessions/new" className="border rounded-xl px-3 py-2 inline-block">
          New session
        </Link>
      </div>
    );
  }

  const sessions = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <Link href="/admin/sessions/new" className="border rounded-xl px-3 py-2">
          New session
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Session</th>
              <th className="py-2 pr-4">Capacity</th>
              <th className="py-2 pr-4">Signed up</th>
              <th className="py-2 pr-4">Waiting list</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sessions.map((s) => {
              const isFull = s.signed_up_count >= s.capacity;

              return (
                <tr key={s.id} className="border-b">
                  <td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4">{s.capacity}</td>
                  <td className="py-2 pr-4">
                    {s.signed_up_count}/{s.capacity}
                  </td>
                  <td className="py-2 pr-4">{s.waiting_list_count}</td>
                  <td className="py-2 pr-4">{isFull ? "FULL" : "OPEN"}</td>

                  <td className="py-2 pr-4 space-x-2">
                    <Link className="underline" href={`/admin/sessions/${s.id}`}>
                      Manage
                    </Link>

                    {/* These two are placeholders until we implement the API routes */}
                    <button className="underline" disabled title="Implement later">
                      Close
                    </button>
                    <button className="underline" disabled title="Implement later">
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sessions.length === 0 && (
          <p className="py-4 opacity-70">No sessions yet. Create one using “New session”.</p>
        )}
      </div>
    </div>
  );
}
