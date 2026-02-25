import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import type { CSSProperties } from "react";
import { supabaseServer } from "@/lib/supabase-server";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sectionItems = [
  { href: "/club-champs", label: "Overview" },
  { href: "/club-champs/pairings", label: "Pairings" },
  { href: "/club-champs/pools", label: "Pool results" },
  { href: "/club-champs/knockout", label: "Knockout bracket" },
];

const themeVars: CSSProperties = {
  ["--ink" as string]: "#0c1f30",
  ["--muted" as string]: "#4f6273",
  ["--paper" as string]: "#e9f0ea",
  ["--card" as string]: "#ffffff",
  ["--line" as string]: "#b5c9be",
  ["--accent" as string]: "#d24a3d",
  ["--ok" as string]: "#168557",
  ["--wait" as string]: "#df8ea0",
  ["--cool" as string]: "#154c86",
  ["--chip" as string]: "#e8f0f8",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getPublicSettings() {
  const db = supabaseServer();
  const { data } = await db
    .from("settings")
    .select("club_champs_public_enabled,club_champs_pairs_only_public")
    .eq("id", 1)
    .single();

  return {
    clubChampsPublicEnabled: Boolean(data?.club_champs_public_enabled),
    clubChampsPairsOnlyPublic: Boolean(data?.club_champs_pairs_only_public),
  };
}

export default async function ClubChampsPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getPublicSettings();
  const enabled = settings.clubChampsPublicEnabled;
  const pairsOnlyPublic = settings.clubChampsPairsOnlyPublic;

  if (!enabled) {
    return (
      <div
        className={`${space.className} min-h-screen bg-[var(--paper)] text-[var(--ink)]`}
        style={themeVars}
      >
        <div className="mx-auto max-w-4xl px-5 py-10">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
            <h1 className="text-xl font-semibold">Club champs</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This section is not currently published.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-2 text-sm font-medium"
            >
              Back to sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${space.className} min-h-screen bg-[var(--paper)] text-[var(--ink)]`}
      style={themeVars}
    >
      <div className="relative isolate mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
        <div className="pointer-events-none absolute -left-24 top-0 -z-10 h-72 w-72 rounded-full bg-[#9ac7ab] opacity-45 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-12 -z-10 h-56 w-56 rounded-full bg-[#8fb2d9] opacity-35 blur-3xl" />
        <div className="pointer-events-none absolute right-24 top-48 -z-10 h-44 w-44 rounded-full bg-[#e6b67f] opacity-28 blur-3xl" />

        <header className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                EUBC Club Champs
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">
                Tournament updates
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-full border border-[var(--cool)]/25 bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm transition hover:bg-[var(--chip)]"
            >
              Back to sessions
            </Link>
          </div>
          <p className="max-w-3xl text-sm text-[var(--muted)] sm:text-base">
            Follow pairings, pool-stage results, and knockout progress.
          </p>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2">
          {sectionItems.map((item) => {
            const disabled =
              pairsOnlyPublic &&
              (item.href === "/club-champs/pools" || item.href === "/club-champs/knockout");

            if (disabled) {
              return (
                <span
                  key={item.href}
                  aria-disabled="true"
                  className="cursor-not-allowed rounded-xl border border-[var(--cool)]/20 bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm opacity-60 saturate-50"
                >
                  {item.label}
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-[var(--cool)]/20 bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm transition hover:translate-y-[-1px] hover:bg-[var(--chip)]"
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
