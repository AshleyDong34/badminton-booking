import { supabaseServer } from "@/lib/supabase-server";
import WhitelistUploadForm from "./WhitelistUploadForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  ok?: string;
  error?: string;
  inserted?: string;
};

export default async function WhitelistPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const db = supabaseServer();
  const { count, error } = await db
    .from("student_whitelist")
    .select("*", { count: "exact", head: true });

  const { data: whitelist, error: listErr } = await db
    .from("student_whitelist")
    .select("email,student_id")
    .order("email", { ascending: true, nullsFirst: false })
    .limit(200);

  const inserted = params.inserted ?? "";
  const rows = whitelist ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Membership List</h1>
        <p className="text-sm text-[var(--muted)]">
          Upload a CSV/XLSX list of paid member emails and student IDs.
        </p>
      </div>

      {params.ok && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          Import complete. Added {inserted || "0"} rows (duplicates ignored).
        </p>
      )}
      {params.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Import failed: {params.error}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600">
          Failed to load count: {error.message}
        </p>
      )}
      {listErr && (
        <p className="text-sm text-red-600">
          Failed to load rows: {listErr.message}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <WhitelistUploadForm />
      </div>

      <div className="text-sm text-[var(--muted)]">
        Total member rows: {count ?? 0} (showing {rows.length})
      </div>

      {rows.length > 0 ? (
        <div className="border border-[var(--line)] rounded-2xl overflow-x-auto bg-[var(--card)] shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr className="text-left">
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Student ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.email ?? "email"}-${row.student_id ?? "id"}-${index}`}
                  className={index % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
                >
                  <td className="py-3 px-4">{row.email ?? ""}</td>
                  <td className="py-3 px-4">{row.student_id ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">Membership list is empty.</p>
      )}
    </div>
  );
}
