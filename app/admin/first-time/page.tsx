import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  q?: string;
  ok?: string;
  error?: string;
  removed?: string;
};

type Row = {
  id: string;
  email: string | null;
  student_id: string | null;
  created_at: string | null;
};

export default async function FirstTimePage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim();
  const redirectPath = `/admin/first-time${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  const db = supabaseServer();
  let query = db
    .from("first_time_signups")
    .select("id,email,student_id,created_at")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`email.ilike.%${q}%,student_id.ilike.%${q}%`);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">First-time bookings</h1>
        <p className="text-sm text-[var(--muted)]">
          People who used the one-time free booking before membership is required.
        </p>
      </div>

      {(params.ok || params.removed) && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          {params.removed ? "Entry removed." : "Entry saved."}
        </p>
      )}
      {params.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm space-y-4">
        <form action="/admin/first-time" method="get" className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by email or student ID"
            className="flex-1 min-w-[220px] rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
          />
          <button className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm">
            Search
          </button>
          {q && (
            <a
              href="/admin/first-time"
              className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
            >
              Clear
            </a>
          )}
        </form>

        <form
          action="/api/admin/first-time/add"
          method="post"
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input type="hidden" name="redirect" value={redirectPath} />
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">Email</label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)]">Student ID</label>
            <input
              name="student_id"
              required
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
              placeholder="s1234567"
            />
          </div>
          <button className="self-end rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Add entry
          </button>
        </form>
      </div>

      {error && (
        <p className="text-sm text-red-600">Failed to load entries: {error.message}</p>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-[var(--line)] text-[var(--muted)]">
            <tr className="text-left">
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Student ID</th>
              <th className="py-3 px-4">First booked</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                className={index % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
              >
                <td className="py-3 px-4">{row.email ?? ""}</td>
                <td className="py-3 px-4">{row.student_id ?? ""}</td>
                <td className="py-3 px-4">
                  {row.created_at
                    ? new Date(row.created_at).toLocaleString("en-GB")
                    : ""}
                </td>
                <td className="py-3 px-4">
                  <form action="/api/admin/first-time/remove" method="post">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="redirect" value={redirectPath} />
                    <button className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                      Remove
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            No first-time bookings yet.
          </p>
        )}
      </div>
    </div>
  );
}
