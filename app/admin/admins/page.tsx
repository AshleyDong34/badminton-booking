import { supabaseServer } from "@/lib/supabase-server";
import { supabaseSSR } from "@/lib/supabase-ssr";
import RemoveAdminForm from "./RemoveAdminForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminRow = {
  user_id: string;
  created_at: string;
};

type PendingRow = {
  email: string;
  created_at: string;
};

export default async function AdminsPage() {
  const db = supabaseServer();
  const authClient = await supabaseSSR();
  const { data: authData } = await authClient.auth.getUser();
  const currentUserId = authData.user?.id ?? null;

  const { data: admins, error: aErr } = await db
    .from("admins")
    .select("user_id,created_at")
    .order("created_at", { ascending: false });

  const { data: pending, error: pErr } = await db
    .from("pending_admin_emails")
    .select("email,created_at")
    .order("created_at", { ascending: false });

  const adminRows = admins ?? [];
  const emailById = new Map<string, string>();

  if (adminRows.length > 0) {
    const results = await Promise.all(
      adminRows.map(async (admin) => {
        const { data, error } = await db.auth.admin.getUserById(admin.user_id);
        if (error || !data.user?.email) return { id: admin.user_id, email: "" };
        return { id: admin.user_id, email: data.user.email };
      })
    );

    for (const r of results) {
      if (r.email) emailById.set(r.id, r.email);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Admins</h1>
        <p className="text-sm text-[var(--muted)]">
          Invite committee members or remove access for former admins.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <form action="/api/admin/admins/pending/add" method="post" className="space-y-3">
          <label className="block text-sm font-medium">Invite admin by email</label>
          <div className="flex flex-wrap gap-2">
            <input
              name="email"
              type="email"
              required
              className="w-full flex-1 rounded-xl border border-[var(--line)] bg-white p-2"
              placeholder="committee.member@club.org"
            />
            <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
              Add pending
            </button>
          </div>
          <p className="text-sm text-[var(--muted)]">
            They become an admin automatically after they log in with that email.
          </p>
        </form>
      </div>

      {(aErr || pErr) && (
        <p className="text-sm text-red-600">
          Failed to load: {aErr?.message ?? pErr?.message}
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Pending invites</h2>

        {(!pending || pending.length === 0) ? (
          <p className="text-sm text-[var(--muted)]">No pending invites.</p>
        ) : (
          <div className="border border-[var(--line)] rounded-2xl overflow-hidden bg-[var(--card)] shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                <tr className="text-left">
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Invited</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p: PendingRow, idx) => (
                  <tr key={p.email} className={idx % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}>
                    <td className="py-3 px-4">{p.email}</td>
                    <td className="py-3 px-4 text-[var(--muted)]">
                      {new Date(p.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="py-3 px-4">
                      <form action="/api/admin/admins/pending/delete" method="post">
                        <input type="hidden" name="email" value={p.email} />
                        <button
                          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm"
                          type="submit"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Current admins</h2>

        {adminRows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No admins found (this should not happen).</p>
        ) : (
          <div className="border border-[var(--line)] rounded-2xl overflow-hidden bg-[var(--card)] shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                <tr className="text-left">
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Since</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminRows.map((a: AdminRow, idx) => {
                  const isSelf = currentUserId ? a.user_id === currentUserId : false;
                  const email = emailById.get(a.user_id) ?? "";

                  return (
                    <tr key={a.user_id} className={idx % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}>
                      <td className="py-3 px-4 text-sm" title={a.user_id}>
                        {email || "Unknown"}
                      </td>
                      <td className="py-3 px-4 text-[var(--muted)]">
                        {new Date(a.created_at).toLocaleString("en-GB")}
                      </td>
                      <td className="py-3 px-4">
                        {!isSelf && <RemoveAdminForm userId={a.user_id} />}
                        {isSelf && (
                          <span className="text-xs text-[var(--muted)]">This is you</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
