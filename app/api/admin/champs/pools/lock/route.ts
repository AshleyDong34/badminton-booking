import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

type EventType = "level_doubles" | "mixed_doubles";

type PairRow = {
  id: string;
  event: EventType;
  seed_order: number | null;
  pair_strength: number | null;
  created_at: string | null;
};

type MatchInsert = {
  event: EventType;
  pool_number: number;
  match_order: number;
  pair_a_id: string;
  pair_b_id: string;
  pair_a_score: null;
  pair_b_score: null;
};

function sortSeededRows(a: PairRow, b: PairRow) {
  const aSeed = a.seed_order ?? Number.MAX_SAFE_INTEGER;
  const bSeed = b.seed_order ?? Number.MAX_SAFE_INTEGER;
  if (aSeed !== bSeed) return aSeed - bSeed;

  const aStrength = a.pair_strength ?? Number.MAX_SAFE_INTEGER;
  const bStrength = b.pair_strength ?? Number.MAX_SAFE_INTEGER;
  if (aStrength !== bStrength) return aStrength - bStrength;

  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

function buildPoolSizes(total: number, event: EventType) {
  if (total <= 0) return [] as number[];

  // Level doubles: prefer 3 per pool, but allow 4 to absorb leftovers.
  // Mixed doubles: prefer 4 per pool, allow 3 when needed.
  const preferred = event === "mixed_doubles" ? 4 : 3;
  const minSize = event === "mixed_doubles" ? 3 : 3;
  const maxSize = 4;

  let poolCount = Math.max(1, Math.ceil(total / preferred));

  while (poolCount > 1) {
    const smallest = Math.floor(total / poolCount);
    const largest = Math.ceil(total / poolCount);
    if (smallest >= minSize && largest <= maxSize) break;
    if (smallest < minSize && largest <= maxSize) {
      poolCount -= 1;
      continue;
    }
    break;
  }

  const base = Math.floor(total / poolCount);
  const extra = total % poolCount;
  return Array.from({ length: poolCount }, (_, i) => (i < extra ? base + 1 : base));
}

function buildPools(rows: PairRow[], event: EventType) {
  if (rows.length === 0) return [] as PairRow[][];

  const ordered = [...rows].sort(sortSeededRows);
  const sizes = buildPoolSizes(ordered.length, event);
  const pools: PairRow[][] = sizes.map(() => []);

  let cursor = 0;
  let round = 0;
  while (cursor < ordered.length) {
    const indices =
      round % 2 === 0
        ? [...Array(pools.length).keys()]
        : [...Array(pools.length).keys()].reverse();

    for (const idx of indices) {
      if (pools[idx].length >= sizes[idx]) continue;
      if (cursor >= ordered.length) break;
      pools[idx].push(ordered[cursor]);
      cursor += 1;
    }
    round += 1;
  }

  return pools;
}

function buildMatchRows(event: EventType, pools: PairRow[][]): MatchInsert[] {
  const matches: MatchInsert[] = [];
  for (let poolIdx = 0; poolIdx < pools.length; poolIdx++) {
    const pool = pools[poolIdx];
    let order = 1;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        matches.push({
          event,
          pool_number: poolIdx + 1,
          match_order: order,
          pair_a_id: pool[i].id,
          pair_b_id: pool[j].id,
          pair_a_score: null,
          pair_b_score: null,
        });
        order += 1;
      }
    }
  }
  return matches;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const db = supabaseServer();
  const { data, error } = await db
    .from("club_champs_pairs")
    .select("id,event,seed_order,pair_strength,created_at");

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs/pools?error=${encodeURIComponent(error.message)}`, getBaseUrl(req))
    );
  }

  const rows = (data ?? []) as PairRow[];
  if (rows.length === 0) {
    return NextResponse.redirect(
      new URL("/admin/club-champs/pools?error=No+pairs+available+to+lock", getBaseUrl(req))
    );
  }

  const levelRows = rows.filter((r) => r.event === "level_doubles");
  const mixedRows = rows.filter((r) => r.event === "mixed_doubles");

  const eventsToCheck = [levelRows, mixedRows].filter((list) => list.length > 0);
  const hasUnseeded = eventsToCheck.some((list) => list.some((row) => row.seed_order == null));
  if (hasUnseeded) {
    return NextResponse.redirect(
      new URL("/admin/club-champs/pools?error=Save+seeding+first+for+all+pairs", getBaseUrl(req))
    );
  }

  const matchRows = [
    ...buildMatchRows("level_doubles", buildPools(levelRows, "level_doubles")),
    ...buildMatchRows("mixed_doubles", buildPools(mixedRows, "mixed_doubles")),
  ];

  const { error: clearError } = await db.from("club_champs_pool_matches").delete().gte("pool_number", 1);
  if (clearError) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs/pools?error=${encodeURIComponent(clearError.message)}`, getBaseUrl(req))
    );
  }

  if (matchRows.length > 0) {
    const { error: insertError } = await db.from("club_champs_pool_matches").insert(matchRows);
    if (insertError) {
      return NextResponse.redirect(
        new URL(`/admin/club-champs/pools?error=${encodeURIComponent(insertError.message)}`, getBaseUrl(req))
      );
    }
  }

  return NextResponse.redirect(new URL("/admin/club-champs/pools?locked=1", getBaseUrl(req)));
}
