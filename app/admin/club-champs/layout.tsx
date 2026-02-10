import Link from "next/link";

const sectionItems = [
  { href: "/admin/club-champs", label: "1. Pair entries" },
  { href: "/admin/club-champs/seeding", label: "2. Seeding" },
  { href: "/admin/club-champs/pools", label: "3. Pools" },
  { href: "/admin/club-champs/knockout", label: "4. Knockout setup" },
  { href: "/admin/club-champs/knockout-matches", label: "5. Knockout matches" },
];

export default function ClubChampsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          Club champs sections
        </div>
        <nav className="flex flex-wrap gap-2">
          {sectionItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--ink)] shadow-sm transition hover:bg-[var(--chip)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {children}
    </div>
  );
}
