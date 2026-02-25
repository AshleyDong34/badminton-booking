import { supabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
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

type PublicPoolMatchRow = PoolMatchRow & {
  is_playing: boolean;
};

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

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function pairPlayers(pair: PairRow | undefined) {
  if (!pair) return [];
  return [normalizeName(pair.player_one_name), normalizeName(pair.player_two_name)].filter(Boolean);
}

function computeRecommendedMatches(matches: PublicPoolMatchRow[], pairById: Map<string, PairRow>) {
  const remainingByPair = new Map<string, number>();
  const playedByPair = new Map<string, number>();
  const playedByPlayer = new Map<string, number>();
  const pendingByPlayer = new Map<string, number>();

  const addPlayed = (pairId: string) => {
    playedByPair.set(pairId, (playedByPair.get(pairId) ?? 0) + 1);
    for (const player of pairPlayers(pairById.get(pairId))) {
      playedByPlayer.set(player, (playedByPlayer.get(player) ?? 0) + 1);
    }
  };

  for (const match of matches) {
    const scored = match.pair_a_score != null && match.pair_b_score != null;
    if (scored) {
      addPlayed(match.pair_a_id);
      addPlayed(match.pair_b_id);
      continue;
    }

    remainingByPair.set(match.pair_a_id, (remainingByPair.get(match.pair_a_id) ?? 0) + 1);
    remainingByPair.set(match.pair_b_id, (remainingByPair.get(match.pair_b_id) ?? 0) + 1);
    for (const player of pairPlayers(pairById.get(match.pair_a_id))) {
      pendingByPlayer.set(player, (pendingByPlayer.get(player) ?? 0) + 1);
    }
    for (const player of pairPlayers(pairById.get(match.pair_b_id))) {
      pendingByPlayer.set(player, (pendingByPlayer.get(player) ?? 0) + 1);
    }
  }

  const busyPlayers = new Set<string>();
  for (const match of matches) {
    if (!match.is_playing) continue;
    for (const key of pairPlayers(pairById.get(match.pair_a_id))) busyPlayers.add(key);
    for (const key of pairPlayers(pairById.get(match.pair_b_id))) busyPlayers.add(key);
  }

  const recommendedByEvent = new Map<EventType, PublicPoolMatchRow>();
  const inPlayMatchesByEvent = new Map<EventType, number>();
  const maxPlayedByPlayer = Math.max(0, ...playedByPlayer.values());

  for (const event of events) {
    const count = matches.filter((match) => match.event === event && match.is_playing).length;
    inPlayMatchesByEvent.set(event, count);
  }

  for (const event of events) {
    const eventPairIds = new Set(
      matches
        .filter((match) => match.event === event)
        .flatMap((match) => [match.pair_a_id, match.pair_b_id])
    );
    const maxPlayedInEvent = Math.max(
      0,
      ...Array.from(eventPairIds).map((pairId) => playedByPair.get(pairId) ?? 0)
    );

    const candidates = matches
      .filter((match) => match.event === event)
      .filter((match) => !match.is_playing)
      .filter((match) => match.pair_a_score == null || match.pair_b_score == null)
      .filter((match) => {
        const keys = [
          ...pairPlayers(pairById.get(match.pair_a_id)),
          ...pairPlayers(pairById.get(match.pair_b_id)),
        ];
        return keys.every((key) => !busyPlayers.has(key));
      });

    const candidateScore = (match: PublicPoolMatchRow) => {
      const pairAPlayed = playedByPair.get(match.pair_a_id) ?? 0;
      const pairBPlayed = playedByPair.get(match.pair_b_id) ?? 0;
      const pairWaitDebt = (maxPlayedInEvent - pairAPlayed) + (maxPlayedInEvent - pairBPlayed);
      const players = [
        ...pairPlayers(pairById.get(match.pair_a_id)),
        ...pairPlayers(pairById.get(match.pair_b_id)),
      ];
      const playerWaitDebt = players.reduce(
        (sum, key) => sum + (maxPlayedByPlayer - (playedByPlayer.get(key) ?? 0)),
        0
      );
      const playerBacklog = players.reduce((sum, key) => sum + (pendingByPlayer.get(key) ?? 0), 0);
      const pairBalanceGap = Math.abs(pairAPlayed - pairBPlayed);
      const remainingWork =
        (remainingByPair.get(match.pair_a_id) ?? 0) + (remainingByPair.get(match.pair_b_id) ?? 0);
      return { pairWaitDebt, playerWaitDebt, playerBacklog, pairBalanceGap, remainingWork };
    };

    candidates.sort((a, b) => {
      const aScore = candidateScore(a);
      const bScore = candidateScore(b);
      if (aScore.pairWaitDebt !== bScore.pairWaitDebt) return bScore.pairWaitDebt - aScore.pairWaitDebt;
      if (aScore.playerWaitDebt !== bScore.playerWaitDebt) return bScore.playerWaitDebt - aScore.playerWaitDebt;
      if (aScore.playerBacklog !== bScore.playerBacklog) return bScore.playerBacklog - aScore.playerBacklog;
      if (aScore.pairBalanceGap !== bScore.pairBalanceGap) return aScore.pairBalanceGap - bScore.pairBalanceGap;
      if (aScore.remainingWork !== bScore.remainingWork) return bScore.remainingWork - aScore.remainingWork;
      if (a.pool_number !== b.pool_number) return a.pool_number - b.pool_number;
      return a.match_order - b.match_order;
    });

    if (candidates[0]) recommendedByEvent.set(event, candidates[0]);
  }

  return {
    recommendedByEvent,
    inPlayMatchesByEvent,
  };
}

function PoolResultsSection({
  event,
  pairs,
  matches,
  recommendedMatchId,
  inPlayCount,
}: {
  event: EventType;
  pairs: PairRow[];
  matches: PublicPoolMatchRow[];
  recommendedMatchId: string | null;
  inPlayCount: number;
}) {
  const eventMatches = matches.filter((match) => match.event === event);
  const scoredMatches = eventMatches.filter(
    (match) => match.pair_a_score !== null && match.pair_b_score !== null
  ).length;
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  if (eventMatches.length === 0) {
    return (
      <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--cool)]">{EVENT_LABEL[event]}</h2>
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
        <p className="text-sm text-[var(--muted)]">
          {inPlayCount > 0 ? `${inPlayCount} matches currently in play.` : "No matches currently in play."}
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
                  <div
                    key={match.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      match.pair_a_score != null && match.pair_b_score != null
                        ? "border-[var(--line)] bg-white"
                        : match.is_playing
                        ? "border-[#f59e0b] bg-[#fff4e7]"
                        : recommendedMatchId === match.id
                        ? "border-[#e7d35b] bg-[#fffbe8]"
                        : "border-[var(--line)] bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                      <span>Match {match.match_order}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          match.pair_a_score != null && match.pair_b_score != null
                            ? "bg-emerald-100 text-emerald-700"
                            : match.is_playing
                            ? "bg-[#fde4bf] text-[#8a5a20]"
                            : recommendedMatchId === match.id
                            ? "bg-[#fff7d1] text-[#7a6715]"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {match.pair_a_score != null && match.pair_b_score != null
                          ? scoreLabel(match)
                          : match.is_playing
                          ? "In play"
                          : recommendedMatchId === match.id
                          ? "Likely next"
                          : "Pending"}
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
  const [{ data: pairData }, { data: matchData }, { data: settingsData }] = await Promise.all([
    db
      .from("club_champs_pairs")
      .select(
        "id,event,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order"
      ),
    db
      .from("club_champs_pool_matches")
      .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,is_playing"),
    db
      .from("settings")
      .select("club_champs_pairs_only_public")
      .eq("id", 1)
      .single(),
  ]);

  const pairsOnlyPublic = Boolean(settingsData?.club_champs_pairs_only_public);
  if (pairsOnlyPublic) {
    return (
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--cool)]">Pool results</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pool updates are temporarily hidden while the committee prepares updates.
        </p>
        <Link
          href="/club-champs/pairings"
          className="mt-4 inline-block rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-2 text-sm font-medium text-[var(--cool)]"
        >
          View pairings
        </Link>
      </section>
    );
  }

  const pairs = (pairData ?? []) as PairRow[];
  const matches = (matchData ?? []) as PublicPoolMatchRow[];
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const recommendation = computeRecommendedMatches(matches, pairById);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-[var(--cool)]">Pool results</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Current pool standings and submitted match scores.
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Starting points shown next to each pair reflect the handicap for that match.
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
            recommendedMatchId={recommendation.recommendedByEvent.get(event)?.id ?? null}
            inPlayCount={recommendation.inPlayMatchesByEvent.get(event) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}
