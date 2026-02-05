import { redirect } from "next/navigation";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import { requireAdmin } from "@/lib/adminGuard";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/sessions", label: "Sessions" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/whitelist", label: "Membership list" },
  { href: "/admin/first-time", label: "First-time bookings" },
  { href: "/admin/admins", label: "Admins" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  console.log("[AdminLayout] running");
  const res = await requireAdmin();
  console.log("[AdminLayout] requireAdmin result:", res);
  if (!res.ok) redirect(`/signin?error=${res.reason}`);

  return (
    <div
      className={`${space.className} min-h-screen bg-[var(--paper)] text-[var(--ink)]`}
      style={
        {
          "--ink": "#14202b",
          "--muted": "#5f6c7b",
          "--paper": "#f6f1e9",
          "--card": "#ffffff",
          "--line": "#e6ddd1",
          "--accent": "#e2b23c",
          "--ok": "#2f9f67",
          "--cool": "#3f8fce",
          "--chip": "#eef5ff",
        } as React.CSSProperties
      }
    >
      <div className="relative">
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#fde9b0] opacity-60 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-16 h-52 w-52 rounded-full bg-[#d9ecff] opacity-70 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                EUBC Badminton
              </p>
              <div className="text-2xl font-semibold">Admin Console</div>
            </div>
            <Link
              href="/"
              className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
            >
              View public site
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-[240px_1fr]">
            <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm md:sticky md:top-6">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Navigate
              </div>
              <nav className="flex flex-wrap gap-2 md:flex-col">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--chip)]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </aside>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
