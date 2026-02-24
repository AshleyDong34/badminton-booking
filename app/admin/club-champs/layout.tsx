import Link from "next/link";
import { getClubChampsStepReadiness } from "@/lib/club-champs-step-readiness";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SectionItem = {
  href: string;
  label: string;
  enabled: boolean;
  lockedHint?: string;
};

export default async function ClubChampsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const readiness = await getClubChampsStepReadiness();
  const sectionItems: SectionItem[] = [
    { href: "/admin/club-champs", label: "1. Pair entries", enabled: true },
    {
      href: "/admin/club-champs/seeding",
      label: "2. Seeding",
      enabled: readiness.seeding,
      lockedHint: "Add pair entries first.",
    },
    {
      href: "/admin/club-champs/pools",
      label: "3. Pools",
      enabled: readiness.pools,
      lockedHint: "Finish and save seeding first.",
    },
    {
      href: "/admin/club-champs/knockout",
      label: "4. Knockout setup",
      enabled: readiness.knockoutSetup,
      lockedHint: "Generate pools first.",
    },
    {
      href: "/admin/club-champs/knockout-matches",
      label: "5. Knockout matches",
      enabled: readiness.knockoutMatches,
      lockedHint: "Set up knockout bracket first.",
    },
    {
      href: "/admin/club-champs/finalize",
      label: "6. Export and finalize",
      enabled: readiness.finalize,
      lockedHint: "Generate knockout matches first.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          Club champs sections
        </div>
        <nav className="flex flex-wrap gap-2">
          {sectionItems.map((item) =>
            item.enabled ? (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--ink)] shadow-sm transition hover:bg-[var(--chip)]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.href}
                title={item.lockedHint ?? "Complete previous step(s) first."}
                className="cursor-not-allowed rounded-xl border border-[var(--line)] bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400 opacity-75 shadow-sm"
                aria-disabled="true"
              >
                {item.label}
              </span>
            )
          )}
        </nav>
      </div>

      {children}
    </div>
  );
}
