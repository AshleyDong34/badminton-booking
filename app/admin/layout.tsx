import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/adminGuard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {

  console.log("[AdminLayout] running");
  const res = await requireAdmin();
  console.log("[AdminLayout] requireAdmin result:", res);
  if (!res.ok) redirect(`/signin?error=${res.reason}`);

  return (
    <div className="min-h-screen grid md:grid-cols-[220px_1fr]">
      <aside className="border-r p-4 md:block hidden">
        <div className="text-xl font-semibold mb-4">Admin</div>
        <nav className="space-y-2">
          <Link className="block" href="/admin">Dashboard</Link>
          <Link className="block" href="/admin/sessions">Sessions</Link>
          <Link className="block" href="/admin/settings">Settings</Link>
          <Link className="block" href="/admin/admins">Admins</Link>
        </nav>
      </aside>
      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}
