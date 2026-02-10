export type EventType = "level_doubles" | "mixed_doubles";

export type PairRow = {
  id: string;
  event: EventType;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  pair_strength: number | null;
  seed_order: number | null;
};

export type PoolMatchRow = {
  id: string;
  event: EventType;
  pool_number: number;
  match_order: number;
  pair_a_id: string;
  pair_b_id: string;
  pair_a_score: number | null;
  pair_b_score: number | null;
};

export type Standing = {
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

export type SeededKnockout = {
  seed: number;
  standing: Standing;
};

export type EventComputation = {
  event: EventType;
  poolRows: Array<{ poolNumber: number; standings: Standing[] }>;
  qualifiers: Standing[];
  eliminated: Standing[];
  expectedMatches: number;
  scoredMatches: number;
  byes: SeededKnockout[];
  pairings: Array<[SeededKnockout, SeededKnockout]>;
};

export const EVENT_LABEL: Record<EventType, string> = {
  level_doubles: "Level doubles",
  mixed_doubles: "Mixed doubles",
};

export function toLevel(value: number | string) {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return `Team ${n}`;
  if (n === 7) return "Rec";
  return String(value ?? "");
}

export function pairLabel(pair: PairRow) {
  return `${pair.player_one_name} (${toLevel(pair.player_one_level)}) + ${pair.player_two_name} (${toLevel(
    pair.player_two_level
  )})`;
}

function pairStrengthNumberOrNull(pair: PairRow | undefined) {
  if (!pair) return null;
  if (typeof pair.pair_strength === "number") return pair.pair_strength;
  const p1 = typeof pair.player_one_level === "number" ? pair.player_one_level : Number(pair.player_one_level);
  const p2 = typeof pair.player_two_level === "number" ? pair.player_two_level : Number(pair.player_two_level);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return p1 + p2;
}

function pairStrength(pair: PairRow) {
  if (typeof pair.pair_strength === "number") return pair.pair_strength;
  const p1 = typeof pair.player_one_level === "number" ? pair.player_one_level : Number(pair.player_one_level);
  const p2 = typeof pair.player_two_level === "number" ? pair.player_two_level : Number(pair.player_two_level);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return Number.MAX_SAFE_INTEGER;
  return p1 + p2;
}

export function computeHandicapStarts(pairA: PairRow | undefined, pairB: PairRow | undefined) {
  const aStrength = pairStrengthNumberOrNull(pairA);
  const bStrength = pairStrengthNumberOrNull(pairB);
  if (aStrength == null || bStrength == null) return null;
  if (aStrength === bStrength) return { pairAStart: 0, pairBStart: 0 };

  const diff = Math.abs(aStrength - bStrength);
  const handicap = Math.min(10, 2 * (diff + 1));

  if (aStrength < bStrength) return { pairAStart: -handicap, pairBStart: 0 };
  return { pairAStart: 0, pairBStart: -handicap };
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

export function nextPowerOfTwo(n: number) {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function defaultAdvanceCount(totalPairs: number, poolCount: number) {
  if (totalPairs <= 0) return 0;
  if (poolCount <= 0) return totalPairs;
  return Math.min(totalPairs, Math.max(2, poolCount * 2));
}

export function resolveAdvanceCount(raw: string | undefined, totalPairs: number, poolCount: number) {
  const fallback = defaultAdvanceCount(totalPairs, poolCount);
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(0, Math.min(totalPairs, value));
}

export function computeEventFromPools(args: {
  event: EventType;
  pairs: PairRow[];
  matches: PoolMatchRow[];
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

function bracketSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  const prev = bracketSeedOrder(size / 2);
  const out: number[] = [];
  for (const seed of prev) {
    out.push(seed);
    out.push(size + 1 - seed);
  }
  return out;
}

export function buildKnockoutStageOneMatches(qualifiers: Standing[]) {
  const seeded = qualifiers.map((standing, index) => ({ seed: index + 1, standing }));
  const bracketSize = nextPowerOfTwo(seeded.length);
  const rounds = bracketSize <= 1 ? 0 : Math.log2(bracketSize);
  const order = bracketSeedOrder(bracketSize);
  const seedToPair = new Map(seeded.map((item) => [item.seed, item.standing.pair.id]));

  const stageOneMatches: Array<{
    matchOrder: number;
    pairAId: string | null;
    pairBId: string | null;
    autoWinnerId: string | null;
  }> = [];

  for (let i = 0; i < order.length; i += 2) {
    const pairAId = seedToPair.get(order[i]) ?? null;
    const pairBId = seedToPair.get(order[i + 1]) ?? null;
    const autoWinnerId = pairAId && !pairBId ? pairAId : pairBId && !pairAId ? pairBId : null;
    stageOneMatches.push({
      matchOrder: i / 2 + 1,
      pairAId,
      pairBId,
      autoWinnerId,
    });
  }

  return { seeded, bracketSize, rounds, stageOneMatches };
}

export function knockoutStageLabel(stage: number, totalStages: number) {
  if (totalStages <= 0) return `Stage ${stage}`;
  if (stage === totalStages) return "Final";
  if (stage === totalStages - 1) return "Semifinal";
  if (stage === totalStages - 2) return "Quarterfinal";
  return `Round ${stage}`;
}
