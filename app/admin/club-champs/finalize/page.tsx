import { supabaseServer } from "@/lib/supabase-server";
import { FinalizeActions } from "./FinalizeActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  done?: string;
  error?: string;
};

export default async function ClubChampsFinalizePage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const db = supabaseServer();

  const [{ count: pairCount }, { count: poolCount }, { count: knockoutCount }] =
    await Promise.all([
      db
        .from("club_champs_pairs")
        .select("*", { count: "exact", head: true }),
      db
        .from("club_champs_pool_matches")
        .select("*", { count: "exact", head: true }),
      db
        .from("club_champs_knockout_matches")
        .select("*", { count: "exact", head: true }),
    ]);

  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Step 6: Export and finalize</h1>
        <p className="text-sm text-[var(--muted)]">
          Export final tournament data, then finalize and reset Club Champs for next use.
        </p>
      </div>

      {params.done && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Club Champs finalized. Tournament data cleared and public Club Champs hidden.
        </p>
      )}
      {params.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Current data snapshot</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Pairs</div>
            <div className="mt-1 text-xl font-semibold">{pairCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Pool matches</div>
            <div className="mt-1 text-xl font-semibold">{poolCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">Knockout matches</div>
            <div className="mt-1 text-xl font-semibold">{knockoutCount ?? 0}</div>
          </div>
        </div>
      </section>

      <FinalizeActions />
    </div>
  );
}
