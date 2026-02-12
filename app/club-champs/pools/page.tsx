import { supabaseServer } from "@/lib/supabase-server";
import {
  computeHandicapStarts,
  EVENT_LABEL,
  computeEventFromPools,
  toLevel,
  type EventType,
  type PairRow,
  type PoolMatchRow,
} from "@/lib/club-champs-knockout";
import LiveAutoRefresh from "../LiveAutoRefresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const events: EventType[] = ["level_doubles", "mixed_doubles"];

function poolName(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return `Pool ${alphabet[index]}`;
  return `Pool ${index + 1}`;
}

function pairShortLabel(pair: PairRow | undefined) {
  if (!pair) return "TBD";
  return `${pair.player_one_name} + ${pair.player_two_name}`;
}

function scoreLabel(match: PoolMatchRow) {
  if (match.pair_a_score == null || match.pair_b_score == null) return "Pending";
  return `${match.pair_a_score} - ${match.pair_b_score}`;
}

function startLabel(value: number | undefined) {
  if (value == null) return "start ?";
  return `start ${value}`;
}

function PoolResultsSection({
  event,
  pairs,
  matches,
}: {
  event: EventType;
  pairs: PairRow[];
  matches: PoolMatchRow[];
}) {
  const eventMatches = matches.filter((match) => match.event === event);
  const scoredMatches = eventMatches.filter(
    (match) => match.pair_a_score !== null && match.pair_b_score !== null
  ).length;
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  if (eventMatches.length === 0) {
    return (
      <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{EVENT_LABEL[event]}</h2>
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--muted)]">
          No updates yet.
        </p>
      </section>
    );
  }

  const standings = computeEventFromPools({
    event,
    pairs,
    matches,
    advanceCount: pairs.filter((pair) => pair.event === event).length,
  });

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">{EVENT_LABEL[event]}</h2>
        <p className="text-sm text-[var(--muted)]">
          {scoredMatches === 0
            ? "Fixtures published. No results submitted yet."
            : `${scoredMatches}/${eventMatches.length} matches scored.`}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {standings.poolRows.map((pool) => {
          const poolMatches = eventMatches
            .filter((match) => match.pool_number === pool.poolNumber)
            .sort((a, b) => a.match_order - b.match_order);

          return (
            <article
              key={`${event}-pool-${pool.poolNumber}`}
              className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4"
            >
              <h3 className="font-semibold">{poolName(pool.poolNumber - 1)}</h3>

              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <thead className="text-left text-xs text-[var(--muted)]">
                    <tr>
                      <th className="w-10 py-1 pr-2">Rank</th>
                      <th className="py-1 pr-2">Pair</th>
                      <th className="w-12 py-1 pr-2 text-right">W-L</th>
                      <th className="w-12 py-1 pr-2 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.standings.map((row) => (
                      <tr key={row.pair.id} className="border-t border-[var(--line)]">
                        <td className="py-1 pr-2 font-semibold">{row.poolRank}</td>
                        <td className="min-w-0 py-1 pr-2 text-[13px] leading-5 sm:text-sm">
                          <span className="text-[var(--cool)]">{row.pair.player_one_name}</span>
                          <span className="text-[var(--muted)]">
                            {" "}
                            ({toLevel(row.pair.player_one_level)})
                          </span>
                          <span className="text-[var(--muted)]"> + </span>
                          <span className="text-[var(--ok)]">{row.pair.player_two_name}</span>
                          <span className="text-[var(--muted)]">
                            {" "}
                            ({toLevel(row.pair.player_two_level)})
                          </span>
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {row.wins}-{row.losses}
                        </td>
                        <td className="py-1 pr-2 text-right">{row.pointDiff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Match results
                </p>
                {poolMatches.map((match) => (
                  <div key={match.id} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                      <span>Match {match.match_order}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          match.pair_a_score != null && match.pair_b_score != null
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {scoreLabel(match)}
                      </span>
                    </div>
                    {(() => {
                      const pairA = pairById.get(match.pair_a_id);
                      const pairB = pairById.get(match.pair_b_id);
                      const starts = computeHandicapStarts(pairA, pairB);
                      return (
                        <div className="space-y-1">
                          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                            <span className="min-w-0 truncate text-[13px] sm:text-sm">{pairShortLabel(pairA)}</span>
                            <span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-xs text-[var(--muted)]">
                              {startLabel(starts?.pairAStart)}
                            </span>
                            <span className="w-6 text-right font-semibold">
                              {match.pair_a_score ?? "-"}
                            </span>
                          </div>
                          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                            <span className="min-w-0 truncate text-[13px] sm:text-sm">{pairShortLabel(pairB)}</span>
                            <span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-xs text-[var(--muted)]">
                              {startLabel(starts?.pairBStart)}
                            </span>
                            <span className="w-6 text-right font-semibold">
                              {match.pair_b_score ?? "-"}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default async function PublicClubChampsPoolsPage() {
  const db = supabaseServer();
  const [{ data: pairData }, { data: matchData }] = await Promise.all([
    db
      .from("club_champs_pairs")
      .select(
        "id,event,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order"
      ),
    db
      .from("club_champs_pool_matches")
      .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score"),
  ]);

  const pairs = (pairData ?? []) as PairRow[];
  const matches = (matchData ?? []) as PoolMatchRow[];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Pool results</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Current pool standings and submitted match scores.
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Starting points shown next to each pair are handicap starts for that match.
        </p>
        <LiveAutoRefresh intervalMs={15000} />
      </section>

      <div className="space-y-4">
        {events.map((event) => (
          <PoolResultsSection
            key={event}
            event={event}
            pairs={pairs}
            matches={matches}
          />
        ))}
      </div>
    </div>
  );
}
