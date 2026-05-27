"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  section?: "system";
};

export default function AdminShell({
  navItems,
  children,
}: {
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const collapsedKey = "admin-shell-collapsed";
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [loadedPreference, setLoadedPreference] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(collapsedKey) === "1");
    } catch {
      // Ignore storage failures.
    } finally {
      setLoadedPreference(true);
    }
  }, []);

  useEffect(() => {
    if (!loadedPreference) return;
    try {
      window.localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, [collapsed, loadedPreference]);

  function toggleNav() {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setCollapsed((current) => !current);
      return;
    }
    setMobileOpen((current) => !current);
  }

  function closeMobileNav() {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    setMobileOpen(false);
  }

  return (
    <div className="relative min-h-[calc(100vh-220px)] w-full">
      <button
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={mobileOpen || !collapsed}
        onClick={toggleNav}
        className={`fixed left-0 top-28 z-50 rounded-r-xl border border-[var(--line)] bg-[var(--card)] px-2 py-2 text-xs font-semibold shadow-lg transition ${
          mobileOpen ? "translate-x-72" : "translate-x-0"
        } ${
          collapsed ? "md:translate-x-0" : "md:translate-x-72"
        }`}
      >
        <span className="md:hidden">{mobileOpen ? "<<" : ">>"}</span>
        <span className="hidden md:inline">{collapsed ? ">>" : "<<"}</span>
      </button>

      <div
        className={`fixed inset-0 z-30 bg-black/25 transition md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-72 max-w-[88vw] border-r border-[var(--line)] bg-[var(--card)] shadow-xl transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:-translate-x-full" : "md:translate-x-0"}`}
      >
        <div className="h-full overflow-y-auto p-4 pt-20">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
            Navigate
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map((item, index) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
              const previous = navItems[index - 1];
              const startsSystemSection =
                item.section === "system" && previous?.section !== "system";
              return (
                <div key={item.href}>
                  {startsSystemSection && (
                    <div className="my-2 border-t border-[var(--line)] pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      Admin
                    </div>
                  )}
                  <Link
                    href={item.href}
                    onClick={closeMobileNav}
                    className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-[var(--chip)] text-[var(--ink)]"
                        : "text-[var(--ink)] hover:bg-[var(--chip)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      <main
        className={`min-w-0 w-full transition-[padding-left] duration-300 ${
          collapsed ? "md:pl-4" : "md:pl-[18rem]"
        }`}
      >
        <div className="w-full [&>*]:mx-auto [&>*]:w-full">{children}</div>
      </main>
    </div>
  );
}
