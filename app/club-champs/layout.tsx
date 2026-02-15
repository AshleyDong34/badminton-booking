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
  ["--ink" as string]: "#0f1d15",
  ["--muted" as string]: "#5a6f62",
  ["--paper" as string]: "#edf3ee",
  ["--card" as string]: "#ffffff",
  ["--line" as string]: "#c6d7cb",
  ["--accent" as string]: "#c74d3f",
  ["--ok" as string]: "#24895d",
  ["--wait" as string]: "#e7a7b0",
  ["--cool" as string]: "#1c4064",
  ["--chip" as string]: "#ecf4ee",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function isPublicEnabled() {
  const db = supabaseServer();
  const { data } = await db
    .from("settings")
    .select("club_champs_public_enabled")
    .eq("id", 1)
    .single();

  return Boolean(data?.club_champs_public_enabled);
}

export default async function ClubChampsPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const enabled = await isPublicEnabled();

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
        <div className="pointer-events-none absolute -left-24 top-0 -z-10 h-72 w-72 rounded-full bg-[#b6d2b8] opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-12 -z-10 h-56 w-56 rounded-full bg-[#d8ceb8] opacity-50 blur-3xl" />

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
              className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--cool)] shadow-sm transition hover:bg-[var(--chip)]"
            >
              Back to sessions
            </Link>
          </div>
          <p className="max-w-3xl text-sm text-[var(--muted)] sm:text-base">
            Follow pairings, pool-stage results, and knockout progress.
          </p>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2">
          {sectionItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm font-medium shadow-sm transition hover:translate-y-[-1px] hover:bg-[var(--chip)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}
