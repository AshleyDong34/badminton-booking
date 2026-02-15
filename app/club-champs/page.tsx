import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { EVENT_LABEL, knockoutStageLabel, type EventType } from "@/lib/club-champs-knockout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PairRow = {
  id: string;
  event: EventType;
  player_one_name: string;
  player_two_name: string;
};

type PoolMatchRow = {
  event: EventType;
  pair_a_score: number | null;
  pair_b_score: number | null;
};

type KnockoutMatchRow = {
  event: EventType;
  stage: number;
  winner_pair_id: string | null;
  is_unlocked: boolean;
};

const events: EventType[] = ["level_doubles", "mixed_doubles"];

function pairShortLabel(pair: PairRow | undefined) {
  if (!pair) return "TBD";
  return `${pair.player_one_name} + ${pair.player_two_name}`;
}

function EventStatusCard({
  event,
  pairRows,
  poolRows,
  knockoutRows,
}: {
  event: EventType;
  pairRows: PairRow[];
  poolRows: PoolMatchRow[];
  knockoutRows: KnockoutMatchRow[];
}) {
  const pairCount = pairRows.filter((row) => row.event === event).length;

  const eventPoolRows = poolRows.filter((row) => row.event === event);
  const scoredPools = eventPoolRows.filter(
    (row) => row.pair_a_score !== null && row.pair_b_score !== null
  ).length;

  const eventKnockoutRows = knockoutRows.filter((row) => row.event === event);
  const maxStage =
    eventKnockoutRows.length === 0
      ? 0
      : Math.max(...eventKnockoutRows.map((row) => row.stage));
  const finalWinnerId =
    eventKnockoutRows
      .filter((row) => row.stage === maxStage)
      .find((row) => row.winner_pair_id)?.winner_pair_id ?? null;
  const completedKnockout = eventKnockoutRows.filter(
    (row) => row.winner_pair_id !== null
  ).length;
  const activeStage =
    eventKnockoutRows.length === 0
      ? 0
      : Math.max(
          ...eventKnockoutRows
            .filter((row) => row.is_unlocked)
            .map((row) => row.stage)
        );

  return (
    <article className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--cool)]">{EVENT_LABEL[event]}</h2>

      <div className="rounded-xl border border-[var(--cool)]/20 bg-[var(--chip)] px-3 py-2 text-sm">
        Pairings:{" "}
        <span className="font-semibold">
          {pairCount === 0 ? "No updates yet" : `${pairCount} pairs`}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--ok)]/30 bg-[#ebf6f0] px-3 py-2 text-sm">
        Pool stage:{" "}
        <span className="font-semibold">
          {eventPoolRows.length === 0
            ? "No updates yet"
            : scoredPools === 0
            ? "Fixtures available, no results yet"
            : `${scoredPools}/${eventPoolRows.length} matches scored`}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--accent)]/30 bg-[#fdf0ed] px-3 py-2 text-sm">
        Knockout:{" "}
        <span className="font-semibold">
          {eventKnockoutRows.length === 0
            ? "No updates yet"
            : finalWinnerId
            ? `Winner: ${pairShortLabel(pairRows.find((p) => p.id === finalWinnerId))}`
            : `${completedKnockout}/${eventKnockoutRows.length} matches completed${
                activeStage > 0 ? ` (${knockoutStageLabel(activeStage, maxStage)} live)` : ""
              }`}
        </span>
      </div>
    </article>
  );
}

export default async function PublicClubChampsPage() {
  const db = supabaseServer();
  const [{ data: pairData }, { data: poolData }, { data: knockoutData }] =
    await Promise.all([
      db
        .from("club_champs_pairs")
        .select("id,event,player_one_name,player_two_name"),
      db
        .from("club_champs_pool_matches")
        .select("event,pair_a_score,pair_b_score"),
      db
        .from("club_champs_knockout_matches")
        .select("event,stage,winner_pair_id,is_unlocked"),
    ]);

  const pairRows = (pairData ?? []) as PairRow[];
  const poolRows = (poolData ?? []) as PoolMatchRow[];
  const knockoutRows = (knockoutData ?? []) as KnockoutMatchRow[];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--cool)]">Overview</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Live tournament status for both events. Open each section for full
          details.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/club-champs/pairings"
            className="rounded-xl border border-[var(--cool)]/20 bg-[#eaf2fb] px-4 py-3 text-sm font-semibold text-[var(--cool)] shadow-sm transition hover:translate-y-[-1px]"
          >
            Pairings
          </Link>
          <Link
            href="/club-champs/pools"
            className="rounded-xl border border-[var(--ok)]/25 bg-[#ebf6f0] px-4 py-3 text-sm font-semibold text-[var(--ok)] shadow-sm transition hover:translate-y-[-1px]"
          >
            Pool results
          </Link>
          <Link
            href="/club-champs/knockout"
            className="rounded-xl border border-[var(--accent)]/30 bg-[#fdf0ed] px-4 py-3 text-sm font-semibold text-[var(--accent)] shadow-sm transition hover:translate-y-[-1px]"
          >
            Knockout bracket
          </Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {events.map((event) => (
          <EventStatusCard
            key={event}
            event={event}
            pairRows={pairRows}
            poolRows={poolRows}
            knockoutRows={knockoutRows}
          />
        ))}
      </div>
    </div>
  );
}
