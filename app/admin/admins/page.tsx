import { supabaseServer } from "@/lib/supabase-server";

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

  const { data: admins, error: aErr } = await db
    .from("admins")
    .select("user_id,created_at")
    .order("created_at", { ascending: false });

  const { data: pending, error: pErr } = await db
    .from("pending_admin_emails")
    .select("email,created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Admins</h1>

      {/* Add pending admin by email */}
      <form action="/api/admin/admins/pending/add" method="post" className="space-y-2">
        <label className="block text-sm">Invite admin by email</label>
        <div className="flex gap-2">
          <input
            name="email"
            type="email"
            required
            className="w-full border rounded-xl p-2"
            placeholder="committee.member@club.org"
          />
          <button className="border rounded-xl px-3 py-2 whitespace-nowrap">
            Add pending
          </button>
        </div>
        <p className="text-sm opacity-70">
          They become an admin automatically after they log in with that email.
        </p>
      </form>

      {(aErr || pErr) && (
        <p className="text-sm text-red-600">
          Failed to load: {aErr?.message ?? pErr?.message}
        </p>
      )}

      {/* Pending list */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Pending invites</h2>

        {(!pending || pending.length === 0) ? (
          <p className="text-sm opacity-70">No pending invites.</p>
        ) : (
          <div className="border rounded-2xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Invited</th>
                  <th className="py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p: PendingRow) => (
                  <tr key={p.email} className="border-b last:border-b-0">
                    <td className="py-2 px-3">{p.email}</td>
                    <td className="py-2 px-3 text-sm opacity-70">
                      {new Date(p.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="py-2 px-3">
                      <form action="/api/admin/admins/pending/delete" method="post">
                        <input type="hidden" name="email" value={p.email} />
                        <button className="underline" type="submit">
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

      {/* Current admins */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Current admins</h2>

        {(!admins || admins.length === 0) ? (
          <p className="text-sm opacity-70">No admins found (this should not happen).</p>
        ) : (
          <div className="border rounded-2xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="py-2 px-3">User ID</th>
                  <th className="py-2 px-3">Since</th>
                  <th className="py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a: AdminRow) => (
                  <tr key={a.user_id} className="border-b last:border-b-0">
                    <td className="py-2 px-3 font-mono text-sm">{a.user_id}</td>
                    <td className="py-2 px-3 text-sm opacity-70">
                      {new Date(a.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="py-2 px-3">
                      <form
                        action="/api/admin/admins/remove"
                        method="post"
                        onSubmit={(e) => {
                          if (!confirm("Remove this admin? They will lose access immediately.")) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="user_id" value={a.user_id} />
                        <button className="underline" type="submit">
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
    </div>
  );
}
