"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
};

export default function AdminShell({
  navItems,
  children,
}: {
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((current) => !current)}
        className={`fixed left-0 top-1/2 z-50 -translate-y-1/2 rounded-r-xl border border-[var(--line)] bg-[var(--card)] px-2 py-3 text-sm font-semibold shadow-lg transition ${
          open ? "translate-x-[248px]" : "translate-x-0"
        }`}
      >
        {open ? "<<" : ">>"}
      </button>

      <div
        className={`fixed inset-0 z-30 bg-black/25 transition ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-72 max-w-[88vw] border-r border-[var(--line)] bg-[var(--card)] shadow-xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full overflow-y-auto p-4 pt-16">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
            Navigate
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--chip)] text-[var(--ink)]"
                      : "text-[var(--ink)] hover:bg-[var(--chip)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
