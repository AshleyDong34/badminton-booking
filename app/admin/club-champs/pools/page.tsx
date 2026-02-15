import { supabaseServer } from "@/lib/supabase-server";
import { LockPoolsForm } from "./LockPoolsForm";
import HashAnchorRestore from "@/app/admin/HashAnchorRestore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EventType = "level_doubles" | "mixed_doubles";

type Row = {
  id: string;
  event: EventType;
  level_doubles_type: string | null;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  pair_strength: number | null;
  seed_order: number | null;
  created_at: string | null;
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

type SeededPair = Row & {
  seed: number;
};

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

function pairStrength(row: Row | undefined) {
  if (!row) return null;
  if (typeof row.pair_strength === "number") return row.pair_strength;

  const p1 = typeof row.player_one_level === "number" ? row.player_one_level : Number(row.player_one_level);
  const p2 = typeof row.player_two_level === "number" ? row.player_two_level : Number(row.player_two_level);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return p1 + p2;
}

function handicapStarts(pairA: Row | undefined, pairB: Row | undefined) {
  const aStrength = pairStrength(pairA);
  const bStrength = pairStrength(pairB);
  if (aStrength == null || bStrength == null) return null;
  if (aStrength === bStrength) return { pairAStart: 0, pairBStart: 0 };

  const diff = Math.abs(aStrength - bStrength);
  const handicap = Math.min(10, 2 * (diff + 1));

  if (aStrength < bStrength) {
    return { pairAStart: -handicap, pairBStart: 0 };
  }
  return { pairAStart: 0, pairBStart: -handicap };
}

function poolName(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return `Pool ${alphabet[index]}`;
  return `Pool ${index + 1}`;
}

function seedSort(a: Row, b: Row) {
  const aSeed = a.seed_order ?? Number.MAX_SAFE_INTEGER;
  const bSeed = b.seed_order ?? Number.MAX_SAFE_INTEGER;
  if (aSeed !== bSeed) return aSeed - bSeed;

  const aStrength = a.pair_strength ?? Number.MAX_SAFE_INTEGER;
  const bStrength = b.pair_strength ?? Number.MAX_SAFE_INTEGER;
  if (aStrength !== bStrength) return aStrength - bStrength;

  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

function buildPoolSizes(total: number, targetSize: 3 | 4) {
  if (total <= 0) return [] as number[];

  const preferred = targetSize;
  const minSize = 3;
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

function buildPools(rows: Row[], targetSize: 3 | 4) {
  if (rows.length === 0) return [] as SeededPair[][];

  const ordered = [...rows].sort(seedSort).map((row, index) => ({
    ...row,
    seed: index + 1,
  }));

  const sizes = buildPoolSizes(ordered.length, targetSize);
  const pools: SeededPair[][] = sizes.map(() => []);

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

function EventPoolsPreview({
  event,
  rows,
  targetSize,
}: {
  event: EventType;
  rows: Row[];
  targetSize: 3 | 4;
}) {
  const pools = buildPools(rows, targetSize);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{EVENT_LABEL[event]} pools</h2>
        <p className="text-sm text-[var(--muted)]">
          Auto-generated from seeding order with snake distribution. Target size is {targetSize} with balanced pools of 3-4 where possible.
        </p>
      </div>

      {pools.length === 0 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
          No pairs available for this event.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pools.map((pool, idx) => {
            return (
              <div
                key={`${event}-${idx}`}
                className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{poolName(idx)}</h3>
                  <span className="text-xs text-[var(--muted)]">{pool.length} pairs</span>
                </div>

                <ul className="space-y-2">
                  {pool.map((pair) => (
                    <li
                      key={pair.id}
                      className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-xs font-semibold">
                          Seed {pair.seed}
                        </span>
                      </div>
                      <div className="font-medium">
                        <span className="text-[var(--cool)]">{pair.player_one_name}</span>
                        <span className="text-[var(--muted)]"> ({toLevel(pair.player_one_level)})</span>
                        <span className="text-[var(--muted)]"> + </span>
                        <span className="text-[var(--ok)]">{pair.player_two_name}</span>
                        <span className="text-[var(--muted)]"> ({toLevel(pair.player_two_level)})</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type SearchParams = {
  locked?: string;
  locked_event?: string;
  updated?: string;
  error?: string;
  level_pool_target?: string;
  mixed_pool_target?: string;
  knockout_reset?: string;
};

function parsePoolTarget(raw: string | undefined, fallback: 3 | 4): 3 | 4 {
  if (raw === "3") return 3;
  if (raw === "4") return 4;
  return fallback;
}

export default async function ClubChampsPoolsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const db = supabaseServer();
  const params = (await searchParams) ?? {};
  const levelPoolTarget = parsePoolTarget(params.level_pool_target, 3);
  const mixedPoolTarget = parsePoolTarget(params.mixed_pool_target, 4);
  const poolRedirectBase = `/admin/club-champs/pools?level_pool_target=${levelPoolTarget}&mixed_pool_target=${mixedPoolTarget}`;

  const { data, error } = await db
    .from("club_champs_pairs")
    .select(
      "id,event,level_doubles_type,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,seed_order,created_at"
    );

  const { data: matchData, error: matchError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score")
    .order("event", { ascending: true })
    .order("pool_number", { ascending: true })
    .order("match_order", { ascending: true });

  const rows = (data ?? []) as Row[];
  const matches = (matchData ?? []) as MatchRow[];
  const levelRows = rows.filter((r) => r.event === "level_doubles");
  const mixedRows = rows.filter((r) => r.event === "mixed_doubles");
  const pairById = new Map(rows.map((row) => [row.id, row]));

  return (
    <div className="max-w-6xl space-y-6">
      <HashAnchorRestore />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Step 3: Pools</h1>
        <p className="text-sm text-[var(--muted)]">
          Generate pools per event from saved seeding, review the generated groups, then enter scores for each fixture.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <LockPoolsForm levelPoolTarget={levelPoolTarget} mixedPoolTarget={mixedPoolTarget} />
      </div>

      {params.locked && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          {params.locked_event === "level_doubles"
            ? "Level doubles pools generated."
            : params.locked_event === "mixed_doubles"
            ? "Mixed doubles pools generated."
            : "Tournament locked and pool fixtures generated."}
        </p>
      )}
      {params.updated && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          Pool scores saved.
        </p>
      )}
      {params.knockout_reset && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Knockout data was reset to prevent stale results after pool changes.
        </p>
      )}
      {params.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pairs: {error.message}
        </p>
      )}
      {matchError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pool matches: {matchError.message}
        </p>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Generated pools review</h2>
        <p className="text-sm text-[var(--muted)]">
          Read-only preview of generated pools for each event. This section is separate from results entry.
        </p>
        <EventPoolsPreview event="level_doubles" rows={levelRows} targetSize={levelPoolTarget} />
        <EventPoolsPreview event="mixed_doubles" rows={mixedRows} targetSize={mixedPoolTarget} />
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Pool match results entry</h2>
        <p className="text-sm text-[var(--muted)]">
          Enter and save scores below. This section is separate from the generated pools review above.
        </p>
        <p className="text-sm text-[var(--muted)]">
          Numbers shown next to each pair name are that pair&apos;s starting points for the match.
        </p>
        <p className="text-sm text-[var(--muted)]">
          Use the global save button to save all entered scores at once. Green match cards mean those scores are saved.
        </p>
        {matches.length === 0 ? (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
            No generated fixtures yet. Lock the tournament first.
          </p>
        ) : (
          <>
            <EventMatchResults
              event="level_doubles"
              matches={matches}
              pairById={pairById}
              redirect={poolRedirectBase}
            />
            <EventMatchResults
              event="mixed_doubles"
              matches={matches}
              pairById={pairById}
              redirect={poolRedirectBase}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EventMatchResults({
  event,
  matches,
  pairById,
  redirect,
}: {
  event: EventType;
  matches: MatchRow[];
  pairById: Map<string, Row>;
  redirect: string;
}) {
  const eventMatches = matches.filter((m) => m.event === event);
  const pools = new Map<number, MatchRow[]>();
  const eventAnchor = `pool-results-${event}`;
  for (const match of eventMatches) {
    const list = pools.get(match.pool_number) ?? [];
    list.push(match);
    pools.set(match.pool_number, list);
  }

  return (
    <section className="space-y-3" id={eventAnchor}>
      <h3 className="text-lg font-semibold">{EVENT_LABEL[event]} results entry</h3>
      {pools.size === 0 ? (
        <p className="text-sm text-[var(--muted)]">No fixtures for this event.</p>
      ) : (
        <form action="/api/admin/champs/pools/matches/bulk-update" method="post" className="space-y-4">
          <input type="hidden" name="event" value={event} />
          <input type="hidden" name="redirect" value={redirect} />
          <input type="hidden" name="anchor" value={eventAnchor} />

          <div className="sticky top-20 z-20 flex items-center justify-between gap-3 rounded-xl border border-[#9db4c8] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-sm text-[#46607a]">
              Save all entered scores for <span className="font-semibold">{EVENT_LABEL[event]}</span>.
            </p>
            <button
              type="submit"
              className="rounded-lg border border-[#9db4c8] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--cool)] shadow-sm"
            >
              Save all scores
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Array.from(pools.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([poolNumber, poolMatches]) => (
                <div
                  key={`${event}-${poolNumber}`}
                  className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm"
                >
                  <h4 className="font-semibold">{poolName(poolNumber - 1)}</h4>
                  <div className="space-y-2">
                    {poolMatches.map((match) => {
                      const pairA = pairById.get(match.pair_a_id);
                      const pairB = pairById.get(match.pair_b_id);
                      const starts = handicapStarts(pairA, pairB);
                      const isSaved = match.pair_a_score !== null && match.pair_b_score !== null;
                      const rowId = `pool-${event}-${poolNumber}-match-${match.match_order}`;
                      return (
                        <div
                          key={match.id}
                          id={rowId}
                          className={`scroll-mt-24 space-y-2 rounded-xl border-2 p-3 ${
                            isSaved
                              ? "border-emerald-400 bg-emerald-50/60"
                              : "border-[#a2b8cb] bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-xs font-semibold text-[#4e6279]">
                              Match {match.match_order}
                            </div>
                            {isSaved ? (
                              <span className="rounded-full border border-emerald-400 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                Saved
                              </span>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                            <div className="text-sm">
                              <span className="font-semibold text-[var(--cool)]">{pairA?.player_one_name ?? "Pair A"}</span>
                              <span className="text-[var(--muted)]"> + </span>
                              <span className="font-semibold text-[var(--ok)]">{pairA?.player_two_name ?? ""}</span>
                              {starts ? (
                                <span className="ml-2 rounded-full border border-[#ccdae8] bg-[var(--chip)] px-2 py-0.5 text-xs text-[var(--muted)]">
                                  start {starts.pairAStart}
                                </span>
                              ) : null}
                            </div>
                            <input
                              name={`pair_a_score__${match.id}`}
                              type="number"
                              min={0}
                              defaultValue={match.pair_a_score ?? ""}
                              className="w-24 rounded-lg border-2 border-[#9eb4c7] bg-white px-2 py-1 text-base font-semibold"
                            />
                          </div>
                          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                            <div className="text-sm">
                              <span className="font-semibold text-[var(--cool)]">{pairB?.player_one_name ?? "Pair B"}</span>
                              <span className="text-[var(--muted)]"> + </span>
                              <span className="font-semibold text-[var(--ok)]">{pairB?.player_two_name ?? ""}</span>
                              {starts ? (
                                <span className="ml-2 rounded-full border border-[#ccdae8] bg-[var(--chip)] px-2 py-0.5 text-xs text-[var(--muted)]">
                                  start {starts.pairBStart}
                                </span>
                              ) : null}
                            </div>
                            <input
                              name={`pair_b_score__${match.id}`}
                              type="number"
                              min={0}
                              defaultValue={match.pair_b_score ?? ""}
                              className="w-24 rounded-lg border-2 border-[#9eb4c7] bg-white px-2 py-1 text-base font-semibold"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg border border-[#9db4c8] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--cool)] shadow-sm"
            >
              Save all scores
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
