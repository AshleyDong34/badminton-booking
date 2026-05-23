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
  ["--ink" as string]: "#081811",
  ["--muted" as string]: "#40584c",
  ["--paper" as string]: "#edf5ee",
  ["--card" as string]: "#ffffff",
  ["--line" as string]: "#bdd8c6",
  ["--accent" as string]: "#d46b3f",
  ["--ok" as string]: "#0f7a4d",
  ["--wait" as string]: "#df8ea0",
  ["--cool" as string]: "#1d6b45",
  ["--chip" as string]: "#eef8f1",
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

        <header className="relative mb-6 overflow-hidden rounded-2xl border border-[#c5dfcc] bg-[linear-gradient(135deg,#e8f6eb_0%,#c5e5cd_48%,#93cba6_100%)] p-5 text-[#0b2719] shadow-[0_18px_50px_rgba(37,86,56,0.16)] sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(255,255,255,0.5),transparent_30%),radial-gradient(circle_at_90%_10%,rgba(255,255,255,0.26),transparent_26%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#315b43]">
                EUBC Club Champs
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">
                Tournament updates
              </h1>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-[#6ea981]/40 bg-white/85 px-4 py-2 text-sm font-semibold text-[#0b3a25] shadow-sm transition hover:bg-white"
            >
              Back to sessions
            </Link>
          </div>
          <p className="relative mt-3 max-w-3xl text-sm text-[#315b43] sm:text-base">
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
                className="rounded-xl border border-[var(--cool)]/20 bg-[linear-gradient(135deg,#ffffff_0%,#eef8f1_50%,#d8eadf_100%)] px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm transition hover:translate-y-[-1px] hover:bg-[var(--chip)]"
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
