import { supabaseServer } from "@/lib/supabase-server";
import {
  EVENT_LABEL,
  computeEventFromPools,
  toLevel,
  type EventType,
  type PairRow,
  type PoolMatchRow,
} from "@/lib/club-champs-knockout";

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
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-xs text-[var(--muted)]">
                    <tr>
                      <th className="py-1 pr-2">Rank</th>
                      <th className="py-1 pr-2">Pair</th>
                      <th className="py-1 pr-2">W-L</th>
                      <th className="py-1 pr-2">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.standings.map((row) => (
                      <tr key={row.pair.id} className="border-t border-[var(--line)]">
                        <td className="py-1 pr-2 font-semibold">{row.poolRank}</td>
                        <td className="py-1 pr-2">
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
                        <td className="py-1 pr-2">
                          {row.wins}-{row.losses}
                        </td>
                        <td className="py-1 pr-2">{row.pointDiff}</td>
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
                  <div
                    key={match.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {pairShortLabel(pairById.get(match.pair_a_id))} vs{" "}
                      {pairShortLabel(pairById.get(match.pair_b_id))}
                    </span>
                    <span className="font-semibold">{scoreLabel(match)}</span>
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
