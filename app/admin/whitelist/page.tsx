import { supabaseServer } from "@/lib/supabase-server";
import WhitelistUploadForm from "./WhitelistUploadForm";
import {
  normalizeMembershipImportColumns,
} from "@/lib/import-column-mappings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const PAGE_SIZE = 1000;

export default async function WhitelistPage() {
  const db = supabaseServer();
  const { count, error } = await db
    .from("student_whitelist")
    .select("*", { count: "exact", head: true });

  const rows: Array<{ id: string; name: string | null; email: string | null; student_id: string | null }> = [];
  let listError: string | null = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error: pageError } = await db
      .from("student_whitelist")
      .select("id,name,email,student_id")
      .order("name", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (pageError) {
      listError = pageError.message;
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const { data: settingsData } = await db
    .from("settings")
    .select("membership_import_columns")
    .eq("id", 1)
    .single();
  const membershipColumns = normalizeMembershipImportColumns(
    settingsData?.membership_import_columns
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Membership List</h1>
        <p className="text-sm text-[var(--muted)]">
          Import the member roster by student ID, review people without IDs by name, and maintain individual entries manually.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Failed to load count: {error.message}
        </p>
      )}
      {listError && (
        <p className="text-sm text-red-600">
          Failed to load rows: {listError}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <WhitelistUploadForm
          defaultNameColumn={membershipColumns.name}
          defaultEmailColumn={membershipColumns.email}
          defaultStudentIdColumn={membershipColumns.studentId}
        />
      </div>

      <div className="text-sm text-[var(--muted)]">
        Total member rows: {count ?? 0} (showing {rows.length})
      </div>

      {rows.length > 0 ? (
        <div className="border border-[var(--line)] rounded-2xl overflow-x-auto bg-[var(--card)] shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="border-b border-[var(--line)] text-[var(--muted)]">
              <tr className="text-left">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Student ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id ?? `${row.email ?? "email"}-${row.student_id ?? "id"}-${index}`}
                  className={index % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
                >
                  <td className="py-3 px-4">{row.name ?? ""}</td>
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
