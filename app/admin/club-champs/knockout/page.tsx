import { supabaseServer } from "@/lib/supabase-server";
import { buildKnockoutStageOneMatches } from "@/lib/club-champs-knockout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EventType = "level_doubles" | "mixed_doubles";

type PairRow = {
  id: string;
  event: EventType;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  pair_strength: number | null;
  seed_order: number | null;
};

type MatchRow = {
  id: string;
  event: EventType;
  pool_number: number;
  match_order: number;
  pair_a_id: string;
  pair_b_id: string;
  pair_a_score: number | null;
  pair_b_score: number | null;
};

type Standing = {
  pair: PairRow;
  poolNumber: number;
  poolRank: number;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
};

type SeededKnockout = {
  seed: number;
  standing: Standing;
};

type EventComputation = {
  event: EventType;
  poolRows: Array<{ poolNumber: number; standings: Standing[] }>;
  qualifiers: Standing[];
  eliminated: Standing[];
  expectedMatches: number;
  scoredMatches: number;
  byes: SeededKnockout[];
  pairings: Array<[SeededKnockout, SeededKnockout]>;
};

type SearchParams = {
  advance_level?: string;
  advance_mixed?: string;
};

const PREVIEW_CARD_HEIGHT = 88;
const PREVIEW_COLUMN_WIDTH = 200;
const PREVIEW_CONNECTOR_WIDTH = 42;

const EVENT_LABEL: Record<EventType, string> = {
  level_doubles: "Level doubles",
  mixed_doubles: "Mixed doubles",
};

function toLevel(value: number | string) {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return `Team ${n}`;
  if (n === 7) return "Rec";
  return String(value ?? "");
}

function pairStrength(pair: PairRow) {
  if (typeof pair.pair_strength === "number") return pair.pair_strength;
  const p1 = typeof pair.player_one_level === "number" ? pair.player_one_level : Number(pair.player_one_level);
  const p2 = typeof pair.player_two_level === "number" ? pair.player_two_level : Number(pair.player_two_level);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return Number.MAX_SAFE_INTEGER;
  return p1 + p2;
}

function pairLabel(pair: PairRow) {
  return `${pair.player_one_name} (${toLevel(pair.player_one_level)}) + ${pair.player_two_name} (${toLevel(
    pair.player_two_level
  )})`;
}

function h2hKey(aId: string, bId: string) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function poolComparator(h2h: Map<string, string>) {
  return (a: Standing, b: Standing) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
    if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;

    const winner = h2h.get(h2hKey(a.pair.id, b.pair.id));
    if (winner === a.pair.id) return -1;
    if (winner === b.pair.id) return 1;

    const aSeed = a.pair.seed_order ?? Number.MAX_SAFE_INTEGER;
    const bSeed = b.pair.seed_order ?? Number.MAX_SAFE_INTEGER;
    if (aSeed !== bSeed) return aSeed - bSeed;

    const aStrength = pairStrength(a.pair);
    const bStrength = pairStrength(b.pair);
    if (aStrength !== bStrength) return aStrength - bStrength;

    return a.pair.id.localeCompare(b.pair.id);
  };
}

function globalComparator(a: Standing, b: Standing) {
  if (a.wins !== b.wins) return b.wins - a.wins;
  if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
  if (a.pointsFor !== b.pointsFor) return b.pointsFor - a.pointsFor;
  if (a.poolRank !== b.poolRank) return a.poolRank - b.poolRank;

  const aSeed = a.pair.seed_order ?? Number.MAX_SAFE_INTEGER;
  const bSeed = b.pair.seed_order ?? Number.MAX_SAFE_INTEGER;
  if (aSeed !== bSeed) return aSeed - bSeed;

  const aStrength = pairStrength(a.pair);
  const bStrength = pairStrength(b.pair);
  if (aStrength !== bStrength) return aStrength - bStrength;

  return a.pair.id.localeCompare(b.pair.id);
}

function nextPowerOfTwo(n: number) {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function defaultAdvanceCount(totalPairs: number, poolCount: number) {
  if (totalPairs <= 0) return 0;
  if (poolCount <= 0) return totalPairs;
  return Math.min(totalPairs, Math.max(2, poolCount * 2));
}

function resolveAdvanceCount(raw: string | undefined, totalPairs: number, poolCount: number) {
  const fallback = defaultAdvanceCount(totalPairs, poolCount);
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(0, Math.min(totalPairs, value));
}

type PreviewMatch = {
  id: string;
  stage: number;
  matchOrder: number;
  pairA: PairRow | null;
  pairB: PairRow | null;
  winnerPair: PairRow | null;
};

function buildPreviewStages(qualifiers: Standing[]) {
  if (qualifiers.length === 0) return [] as Array<{ stage: number; matches: PreviewMatch[] }>;

  const { rounds, stageOneMatches } = buildKnockoutStageOneMatches(qualifiers);
  if (rounds <= 0 || stageOneMatches.length === 0) {
    return [] as Array<{ stage: number; matches: PreviewMatch[] }>;
  }

  const pairById = new Map(qualifiers.map((standing) => [standing.pair.id, standing.pair]));
  const stages: Array<{ stage: number; matches: PreviewMatch[] }> = [];

  const firstStage: PreviewMatch[] = stageOneMatches.map((base) => {
    const pairA = base.pairAId ? pairById.get(base.pairAId) ?? null : null;
    const pairB = base.pairBId ? pairById.get(base.pairBId) ?? null : null;
    const winnerPair = base.autoWinnerId ? pairById.get(base.autoWinnerId) ?? null : null;
    return {
      id: `s1-m${base.matchOrder}`,
      stage: 1,
      matchOrder: base.matchOrder,
      pairA,
      pairB,
      winnerPair,
    };
  });
  stages.push({ stage: 1, matches: firstStage });

  for (let stage = 2; stage <= rounds; stage++) {
    const prev = stages[stage - 2]?.matches ?? [];
    const matchCount = Math.floor(prev.length / 2);
    const current: PreviewMatch[] = [];

    for (let i = 0; i < matchCount; i++) {
      const sourceA = prev[i * 2];
      const sourceB = prev[i * 2 + 1];
      const pairA = sourceA?.winnerPair ?? null;
      const pairB = sourceB?.winnerPair ?? null;
      // Preview mode: only show immediate next-round placements from round-one byes.
      // Do not chain auto-advance through later rounds, otherwise pairs appear to
      // jump straight to semifinal/final before results are entered.
      const winnerPair = null;
      current.push({
        id: `s${stage}-m${i + 1}`,
        stage,
        matchOrder: i + 1,
        pairA,
        pairB,
        winnerPair,
      });
    }
    stages.push({ stage, matches: current });
  }

  return stages;
}

function previewCenterPercent(index: number, total: number) {
  return ((2 * index + 1) / (2 * total)) * 100;
}

function stageLabelByIndex(stageIndex: number, totalStages: number, matchCount: number) {
  if (stageIndex === totalStages - 1) return "Final";
  if (stageIndex === totalStages - 2) return "Semifinal";
  if (stageIndex === totalStages - 3) return "Quarterfinal";
  return `Round of ${matchCount * 2}`;
}

function previewPairLabel(args: {
  pair: PairRow | null;
  otherPair: PairRow | null;
  isFirstStage: boolean;
}) {
  const { pair, otherPair, isFirstStage } = args;
  if (pair) return `${pair.player_one_name} + ${pair.player_two_name}`;
  if (isFirstStage && otherPair) return "BYE";
  return "TBD";
}

function PreviewConnectorColumn({
  prevCount,
  nextCount,
  heightPx,
}: {
  prevCount: number;
  nextCount: number;
  heightPx: number;
}) {
  if (prevCount === 0 || nextCount === 0) return null;

  return (
    <div
      className="relative shrink-0"
      style={{ width: `${PREVIEW_CONNECTOR_WIDTH}px`, height: `${heightPx}px` }}
      aria-hidden
    >
      {Array.from({ length: nextCount }, (_, i) => {
        const sourceA = 2 * i;
        const sourceB = 2 * i + 1;
        const y1 = previewCenterPercent(sourceA, prevCount);
        const y2 = previewCenterPercent(sourceB, prevCount);
        const yTarget = previewCenterPercent(i, nextCount);
        const top = Math.min(y1, y2);
        const lineHeight = Math.abs(y2 - y1);

        return (
          <div key={`preview-conn-${i}`}>
            <div
              className="absolute left-0 border-t border-[var(--line)]"
              style={{
                top: `${y1}%`,
                width: `${PREVIEW_CONNECTOR_WIDTH * 0.45}px`,
                transform: "translateY(-50%)",
              }}
            />
            <div
              className="absolute left-0 border-t border-[var(--line)]"
              style={{
                top: `${y2}%`,
                width: `${PREVIEW_CONNECTOR_WIDTH * 0.45}px`,
                transform: "translateY(-50%)",
              }}
            />
            <div
              className="absolute border-l border-[var(--line)]"
              style={{
                left: `${PREVIEW_CONNECTOR_WIDTH * 0.45}px`,
                top: `${top}%`,
                height: `${lineHeight}%`,
              }}
            />
            <div
              className="absolute border-t border-[var(--line)]"
              style={{
                left: `${PREVIEW_CONNECTOR_WIDTH * 0.45}px`,
                top: `${yTarget}%`,
                width: `${PREVIEW_CONNECTOR_WIDTH * 0.55}px`,
                transform: "translateY(-50%)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function KnockoutPreviewTree({ qualifiers }: { qualifiers: Standing[] }) {
  if (qualifiers.length < 2) {
    return (
      <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm text-[var(--muted)]">
        Not enough qualified pairs to create a knockout bracket.
      </p>
    );
  }

  const stages = buildPreviewStages(qualifiers);
  if (stages.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm text-[var(--muted)]">
        Knockout preview is not available yet.
      </p>
    );
  }

  const stageOneMatches = stages[0]?.matches.length ?? 1;
  const heightPx = Math.max(stageOneMatches * 110, 200);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-full">
        <div className="mb-2 flex items-end">
          {stages.map(({ matches }, stageIndex) => (
            <div key={`head-${stageIndex}`} className="contents">
              <div
                className="shrink-0 px-1"
                style={{ width: `${PREVIEW_COLUMN_WIDTH}px` }}
              >
                <h4 className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-2 py-1.5 text-xs font-semibold">
                  {stageLabelByIndex(stageIndex, stages.length, matches.length)}
                </h4>
              </div>
              {stageIndex < stages.length - 1 && (
                <div
                  className="shrink-0"
                  style={{ width: `${PREVIEW_CONNECTOR_WIDTH}px` }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex">
          {stages.map(({ stage, matches }, stageIndex) => (
            <div key={`col-${stage}`} className="contents">
              <div
                className="relative shrink-0"
                style={{ width: `${PREVIEW_COLUMN_WIDTH}px`, height: `${heightPx}px` }}
              >
                {matches.map((match, matchIndex) => {
                  const topPercent = previewCenterPercent(matchIndex, matches.length);
                  const isFirstStage = stageIndex === 0;
                  return (
                    <article
                      key={match.id}
                      className={`absolute left-0 right-0 rounded-xl border p-2 text-xs ${
                        match.winnerPair
                          ? "border-emerald-300 bg-emerald-50/50"
                          : "border-[var(--line)] bg-white"
                      }`}
                      style={{
                        top: `calc(${topPercent}% - ${PREVIEW_CARD_HEIGHT / 2}px)`,
                        minHeight: `${PREVIEW_CARD_HEIGHT}px`,
                      }}
                    >
                      <div className="mb-1 text-[11px] text-[var(--muted)]">
                        Match {match.matchOrder}
                      </div>
                      <div
                        className={
                          match.winnerPair && match.pairA?.id === match.winnerPair.id
                            ? "font-semibold text-emerald-700"
                            : ""
                        }
                      >
                        {previewPairLabel({
                          pair: match.pairA,
                          otherPair: match.pairB,
                          isFirstStage,
                        })}
                      </div>
                      <div
                        className={
                          match.winnerPair && match.pairB?.id === match.winnerPair.id
                            ? "font-semibold text-emerald-700"
                            : ""
                        }
                      >
                        {previewPairLabel({
                          pair: match.pairB,
                          otherPair: match.pairA,
                          isFirstStage,
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
              {stageIndex < stages.length - 1 && (
                <PreviewConnectorColumn
                  prevCount={matches.length}
                  nextCount={stages[stageIndex + 1].matches.length}
                  heightPx={heightPx}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function computeEvent(args: {
  event: EventType;
  pairs: PairRow[];
  matches: MatchRow[];
  advanceCount: number;
}) {
  const { event, pairs, matches, advanceCount } = args;
  const eventPairs = pairs.filter((p) => p.event === event);
  const eventMatches = matches.filter((m) => m.event === event);
  const pairMap = new Map(eventPairs.map((p) => [p.id, p]));

  const standings = new Map<string, Standing>();
  const h2h = new Map<string, string>();

  for (const match of eventMatches) {
    const pairA = pairMap.get(match.pair_a_id);
    const pairB = pairMap.get(match.pair_b_id);
    if (!pairA || !pairB) continue;

    if (!standings.has(pairA.id)) {
      standings.set(pairA.id, {
        pair: pairA,
        poolNumber: match.pool_number,
        poolRank: 0,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      });
    }
    if (!standings.has(pairB.id)) {
      standings.set(pairB.id, {
        pair: pairB,
        poolNumber: match.pool_number,
        poolRank: 0,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      });
    }
  }

  let scoredMatches = 0;
  for (const match of eventMatches) {
    if (match.pair_a_score == null || match.pair_b_score == null) continue;
    const a = standings.get(match.pair_a_id);
    const b = standings.get(match.pair_b_id);
    if (!a || !b) continue;

    scoredMatches += 1;
    a.played += 1;
    b.played += 1;
    a.pointsFor += match.pair_a_score;
    a.pointsAgainst += match.pair_b_score;
    b.pointsFor += match.pair_b_score;
    b.pointsAgainst += match.pair_a_score;
    a.pointDiff = a.pointsFor - a.pointsAgainst;
    b.pointDiff = b.pointsFor - b.pointsAgainst;

    if (match.pair_a_score > match.pair_b_score) {
      a.wins += 1;
      b.losses += 1;
      h2h.set(h2hKey(a.pair.id, b.pair.id), a.pair.id);
    } else if (match.pair_b_score > match.pair_a_score) {
      b.wins += 1;
      a.losses += 1;
      h2h.set(h2hKey(a.pair.id, b.pair.id), b.pair.id);
    }
  }

  const byPool = new Map<number, Standing[]>();
  for (const standing of standings.values()) {
    const list = byPool.get(standing.poolNumber) ?? [];
    list.push(standing);
    byPool.set(standing.poolNumber, list);
  }

  const sortedPools = Array.from(byPool.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([poolNumber, list]) => {
      const sorted = [...list].sort(poolComparator(h2h));
      sorted.forEach((item, index) => {
        item.poolRank = index + 1;
      });
      return { poolNumber, standings: sorted };
    });

  const poolCount = sortedPools.length;
  const safeAdvance = Math.max(0, Math.min(advanceCount, standings.size));
  const basePerPool = poolCount > 0 ? Math.floor(safeAdvance / poolCount) : 0;

  const selected = new Set<string>();
  for (const pool of sortedPools) {
    for (let i = 0; i < Math.min(basePerPool, pool.standings.length); i++) {
      selected.add(pool.standings[i].pair.id);
    }
  }

  const allStandings = sortedPools.flatMap((pool) => pool.standings);
  const candidates = allStandings
    .filter((s) => !selected.has(s.pair.id))
    .sort(globalComparator);

  const remainingSlots = Math.max(0, safeAdvance - selected.size);
  for (let i = 0; i < Math.min(remainingSlots, candidates.length); i++) {
    selected.add(candidates[i].pair.id);
  }

  const qualifiers = allStandings
    .filter((s) => selected.has(s.pair.id))
    .sort(globalComparator);
  const eliminated = allStandings
    .filter((s) => !selected.has(s.pair.id))
    .sort((a, b) => {
      if (a.poolNumber !== b.poolNumber) return a.poolNumber - b.poolNumber;
      return a.poolRank - b.poolRank;
    });

  const seeded: SeededKnockout[] = qualifiers.map((standing, index) => ({
    seed: index + 1,
    standing,
  }));

  const bracketSize = nextPowerOfTwo(seeded.length);
  const byeCount = Math.max(0, bracketSize - seeded.length);
  const byes = seeded.slice(0, byeCount);
  const active = seeded.slice(byeCount);

  const pairings: Array<[SeededKnockout, SeededKnockout]> = [];
  for (let i = 0; i < Math.floor(active.length / 2); i++) {
    pairings.push([active[i], active[active.length - 1 - i]]);
  }

  return {
    event,
    poolRows: sortedPools,
    qualifiers,
    eliminated,
    expectedMatches: eventMatches.length,
    scoredMatches,
    byes,
    pairings,
  } satisfies EventComputation;
}

function EventKnockoutCard(args: {
  event: EventType;
  data: EventComputation;
  advanceCount: number;
  otherAdvance: number;
}) {
  const { event, data, advanceCount, otherAdvance } = args;
  const otherParamName = event === "level_doubles" ? "advance_mixed" : "advance_level";
  const thisParamName = event === "level_doubles" ? "advance_level" : "advance_mixed";

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{EVENT_LABEL[event]}</h2>
          <p className="text-sm text-[var(--muted)]">
            Rank rule: wins, then point difference, then points scored, then head-to-head.
          </p>
        </div>
        <form action="/admin/club-champs/knockout" method="get" className="flex items-end gap-2">
          <input type="hidden" name={otherParamName} value={otherAdvance} />
          <label className="text-xs font-medium text-[var(--muted)]">
            Advance to knockout
            <input
              name={thisParamName}
              type="number"
              min={0}
              max={data.poolRows.reduce((sum, pool) => sum + pool.standings.length, 0)}
              defaultValue={advanceCount}
              className="mt-1 block w-24 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
            />
          </label>
          <button className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium shadow-sm">
            Preview eliminations
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs text-[var(--muted)]">
        Scored matches: {data.scoredMatches}/{data.expectedMatches}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Qualified ({data.qualifiers.length})</h3>
          <div className="space-y-2">
            {data.qualifiers.map((standing, index) => (
              <div
                key={standing.pair.id}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              >
                <div className="font-semibold">
                  #{index + 1} {pairLabel(standing.pair)}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  Pool {standing.poolNumber} rank {standing.poolRank} | W{standing.wins} L{standing.losses} | +/-{" "}
                  {standing.pointDiff}
                </div>
              </div>
            ))}
            {data.qualifiers.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No qualifiers yet.</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Eliminated ({data.eliminated.length})</h3>
          <div className="space-y-2">
            {data.eliminated.map((standing) => (
              <div
                key={standing.pair.id}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              >
                <div className="font-medium">{pairLabel(standing.pair)}</div>
                <div className="text-xs text-[var(--muted)]">
                  Pool {standing.poolNumber} rank {standing.poolRank} | W{standing.wins} L{standing.losses} | +/-{" "}
                  {standing.pointDiff}
                </div>
              </div>
            ))}
            {data.eliminated.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No eliminated pairs.</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Preview bracket</h3>
        <p className="text-xs text-[var(--muted)]">
          Compact tournament tree preview for the selected advance count.
        </p>
        <KnockoutPreviewTree qualifiers={data.qualifiers} />
      </div>
    </section>
  );
}

export default async function ClubChampsKnockoutPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const db = supabaseServer();

  const { data: pairData, error: pairError } = await db
    .from("club_champs_pairs")
    .select(
      "id,event,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order"
    );

  const { data: matchData, error: matchError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score");

  const pairs = (pairData ?? []) as PairRow[];
  const matches = (matchData ?? []) as MatchRow[];

  const levelPoolCount = new Set(matches.filter((m) => m.event === "level_doubles").map((m) => m.pool_number)).size;
  const mixedPoolCount = new Set(matches.filter((m) => m.event === "mixed_doubles").map((m) => m.pool_number)).size;
  const levelTotal = pairs.filter((p) => p.event === "level_doubles").length;
  const mixedTotal = pairs.filter((p) => p.event === "mixed_doubles").length;

  const advanceLevel = resolveAdvanceCount(params.advance_level, levelTotal, levelPoolCount);
  const advanceMixed = resolveAdvanceCount(params.advance_mixed, mixedTotal, mixedPoolCount);

  const levelResult = computeEvent({
    event: "level_doubles",
    pairs,
    matches,
    advanceCount: advanceLevel,
  });
  const mixedResult = computeEvent({
    event: "mixed_doubles",
    pairs,
    matches,
    advanceCount: advanceMixed,
  });

  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Step 4: Knockout setup</h1>
        <p className="text-sm text-[var(--muted)]">
          Choose how many pairs advance. Remaining pairs are eliminated. Extra qualifier slots are filled by best global
          ranking from the remaining pool entries.
        </p>
      </div>

      {pairError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pairs: {pairError.message}
        </p>
      )}
      {matchError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pool match scores: {matchError.message}
        </p>
      )}

      <EventKnockoutCard
        event="level_doubles"
        data={levelResult}
        advanceCount={advanceLevel}
        otherAdvance={advanceMixed}
      />
      <EventKnockoutCard
        event="mixed_doubles"
        data={mixedResult}
        advanceCount={advanceMixed}
        otherAdvance={advanceLevel}
      />
    </div>
  );
}
