import { supabaseServer } from "@/lib/supabase-server";
import {
  EVENT_LABEL,
  computeEventFromPools,
  knockoutStageLabel,
  pairLabel,
  resolveAdvanceCount,
  type EventType,
  type PairRow,
  type PoolMatchRow,
} from "@/lib/club-champs-knockout";
import { InitKnockoutForm } from "./InitKnockoutForm";
import HashAnchorRestore from "@/app/admin/HashAnchorRestore";
import FloatingFormSave from "../FloatingFormSave";
import CollapsibleSection from "../CollapsibleSection";
import KnockoutEventResultsClient from "./KnockoutEventResultsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type KnockoutMatchRow = {
  id: string;
  event: EventType;
  stage: number;
  match_order: number;
  pair_a_id: string | null;
  pair_b_id: string | null;
  pair_a_score: number | null;
  pair_b_score: number | null;
  game_scores: { games: Array<{ a: number | null; b: number | null }> } | null;
  winner_pair_id: string | null;
  best_of: 1 | 3;
  is_unlocked: boolean;
};

type SearchParams = {
  advance_level?: string;
  advance_mixed?: string;
  initialized?: string;
  initialized_event?: string;
  updated?: string;
  format_saved?: string;
  error?: string;
};

function eventMatchesByStage(event: EventType, rows: KnockoutMatchRow[]) {
  const byStage = new Map<number, KnockoutMatchRow[]>();
  for (const row of rows) {
    if (row.event !== event) continue;
    const list = byStage.get(row.stage) ?? [];
    list.push(row);
    byStage.set(row.stage, list);
  }
  return Array.from(byStage.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([stage, matches]) => ({
      stage,
      matches: [...matches].sort((a, b) => a.match_order - b.match_order),
    }));
}

function pairStrength(row: PairRow | undefined) {
  if (!row) return null;
  if (typeof row.pair_strength === "number") return row.pair_strength;
  const p1 = typeof row.player_one_level === "number" ? row.player_one_level : Number(row.player_one_level);
  const p2 = typeof row.player_two_level === "number" ? row.player_two_level : Number(row.player_two_level);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return p1 + p2;
}

function handicapStarts(pairA: PairRow | undefined, pairB: PairRow | undefined) {
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

function matchGames(match: KnockoutMatchRow) {
  const count = match.best_of === 1 ? 1 : 3;
  const existing = match.game_scores?.games ?? [];
  return Array.from({ length: count }, (_, index) => ({
    a: typeof existing[index]?.a === "number" ? existing[index].a : null,
    b: typeof existing[index]?.b === "number" ? existing[index].b : null,
  }));
}

function isMatchFullyScored(match: KnockoutMatchRow) {
  return match.winner_pair_id != null;
}

function EventKnockoutResultsCard(args: {
  event: EventType;
  knockoutRows: KnockoutMatchRow[];
  pairById: Map<string, PairRow>;
  redirect: string;
}) {
  const { event, knockoutRows, pairById, redirect } = args;
  const stages = eventMatchesByStage(event, knockoutRows);
  const totalStages = stages.length;
  const finalStage = stages[totalStages - 1];
  const finalWinnerId = finalStage?.matches[0]?.winner_pair_id ?? null;
  const winnerPair = finalWinnerId ? pairById.get(finalWinnerId) : null;
  const eventComplete = Boolean(winnerPair);
  const eventSubtitle = winnerPair
    ? `Winner: ${pairLabel(winnerPair)}. Completed and hidden by default.`
    : "Winner not decided yet.";

  return (
    <CollapsibleSection
      id={`knockout-event-${event}`}
      title={`${EVENT_LABEL[event]} knockout`}
      subtitle={eventSubtitle}
      defaultOpen={!eventComplete}
    >
      {stages.length === 0 ? (
        <p className="rounded-xl border border-[#b8c9d8] bg-[#f6faff] px-4 py-3 text-sm text-[#4f6277]">
          No knockout bracket yet for this event. Generate/reset knockout matches first.
        </p>
      ) : (
        <div className="space-y-4">
          {stages.map(({ stage, matches }) => {
            const stageUnlocked = matches.some((m) => m.is_unlocked);
            const stageComplete = matches.every((m) => m.winner_pair_id != null);
            const stageStatus = stageComplete
              ? "Stage complete."
              : stageUnlocked
              ? "Stage unlocked. Enter all match results to unlock the next stage."
              : "Locked until the previous stage is complete.";
            const bestOf = matches[0]?.best_of ?? 1;
            const stageAnchor = `knockout-${event}-stage-${stage}`;
            const stageFormId = `knockout-stage-form-${event}-${stage}`;
            return (
              <CollapsibleSection
                key={`${event}-stage-${stage}`}
                id={`knockout-stage-${event}-${stage}`}
                anchorId={stageAnchor}
                title={knockoutStageLabel(stage, totalStages)}
                subtitle={stageComplete ? "Completed and hidden by default." : stageStatus}
                defaultOpen={!stageComplete}
              >
                <div
                  className={`space-y-3 rounded-xl border p-4 scroll-mt-24 ${
                    stageUnlocked
                      ? "border-[#86a8bf] bg-[#f3f9ff]"
                      : "border-slate-300 bg-slate-100/80"
                  }`}
                >
                  <div className="flex justify-end">
                    <form
                      action="/api/admin/champs/knockout/stage-format/update"
                      method="post"
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="event" value={event} />
                      <input type="hidden" name="stage" value={stage} />
                      <input type="hidden" name="redirect" value={redirect} />
                      <input type="hidden" name="anchor" value={stageAnchor} />
                      <label className="text-xs font-medium text-[var(--muted)]">
                        Match format
                        <select
                          name="best_of"
                          defaultValue={bestOf}
                          className="mt-1 block rounded-lg border border-[#9db4c8] bg-white px-2 py-1 text-sm"
                        >
                          <option value="1">1 game to win</option>
                          <option value="3">Best of 3</option>
                        </select>
                      </label>
                      <button className="rounded-lg border border-[#9db4c8] bg-white px-3 py-1.5 text-xs font-medium text-[var(--cool)] shadow-sm">
                        Save format
                      </button>
                    </form>
                  </div>

                  <p className="text-xs text-[var(--muted)]">
                    {bestOf === 3
                      ? "Best-of-3 scoring: enter all games until a pair wins 2 games (the third game is only needed at 1-1)."
                      : "Single-game scoring: enter the match score."}
                  </p>

                  <form
                    id={stageFormId}
                    action="/api/admin/champs/knockout/stage-results/update"
                    method="post"
                    className="space-y-3"
                  >
                    <input type="hidden" name="event" value={event} />
                    <input type="hidden" name="stage" value={stage} />
                    <input type="hidden" name="redirect" value={redirect} />
                    <input type="hidden" name="anchor" value={stageAnchor} />

                    <div className="space-y-3">
                      {matches.map((match) => {
                        const pairA = match.pair_a_id ? pairById.get(match.pair_a_id) : null;
                        const pairB = match.pair_b_id ? pairById.get(match.pair_b_id) : null;
                        const canScore = !!(match.is_unlocked && pairA && pairB);
                        const isBye = (pairA && !pairB) || (!pairA && pairB);
                        const winner = match.winner_pair_id ? pairById.get(match.winner_pair_id) : null;
                        const games = matchGames(match);
                        const fullyScored = isMatchFullyScored(match);
                        const starts = handicapStarts(pairA ?? undefined, pairB ?? undefined);

                        return (
                          <article
                            key={match.id}
                            className={`space-y-3 rounded-xl border-2 p-3 ${
                              fullyScored
                                ? "border-emerald-400 bg-emerald-50/70"
                                : canScore
                                ? "border-[#8fb1c8] bg-[#f8fcff]"
                                : "border-[#bcc9d5] bg-[#f2f6fa]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-[#51667d]">Match {match.match_order}</div>
                              {winner ? (
                                <span className="rounded-full border border-emerald-400 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                  Winner set
                                </span>
                              ) : null}
                            </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-[#b8cad9] bg-[#e8f1fa] px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a5f74]">
                                Pair A
                              </p>
                              <p className="text-sm font-medium">{pairA ? pairLabel(pairA) : "TBD"}</p>
                              {pairA && starts ? (
                                <span className="mt-1 inline-block rounded-full border border-[#ccdae8] bg-white px-2 py-0.5 text-xs text-[#586f86]">
                                  start {starts.pairAStart}
                                </span>
                              ) : null}
                            </div>
                            <div className="rounded-lg border border-[#b8cad9] bg-[#e8f1fa] px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4a5f74]">
                                Pair B
                              </p>
                              <p className="text-sm font-medium">{pairB ? pairLabel(pairB) : "BYE"}</p>
                              {pairB && starts ? (
                                <span className="mt-1 inline-block rounded-full border border-[#ccdae8] bg-white px-2 py-0.5 text-xs text-[#586f86]">
                                  start {starts.pairBStart}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {isBye ? (
                            <p className="rounded-lg border border-[#bdccd9] bg-white px-3 py-2 text-sm font-medium text-[#566b80]">
                              No score entry needed for a bye match.
                            </p>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border-2 border-[#b7c9d8] bg-[#f8fbff]">
                              <table className="min-w-[360px] w-full border-collapse text-sm">
                                <thead className="bg-[#dce8f3] text-xs font-semibold uppercase tracking-[0.05em] text-[#465d74]">
                                  <tr>
                                    <th className="px-3 py-2 text-left">Game</th>
                                    <th className="px-3 py-2 text-center">Pair A</th>
                                    <th className="px-3 py-2 text-center">Pair B</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {games.map((game, index) => (
                                    <tr key={`${match.id}-g-${index + 1}`} className="border-t border-[#c4d4e2]">
                                      <td className="px-3 py-2 text-xs font-semibold text-[#556b81]">
                                        {match.best_of === 1 ? "Match" : `Game ${index + 1}`}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <input
                                          name={`game_${match.id}_${index + 1}_a`}
                                          type="number"
                                          min={0}
                                          defaultValue={game.a ?? ""}
                                          disabled={!canScore}
                                          data-track-save="1"
                                          className="h-10 w-20 rounded-lg border-2 border-[#9eb4c7] bg-white px-2 py-1 text-center text-base font-semibold disabled:bg-slate-100"
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <input
                                          name={`game_${match.id}_${index + 1}_b`}
                                          type="number"
                                          min={0}
                                          defaultValue={game.b ?? ""}
                                          disabled={!canScore}
                                          data-track-save="1"
                                          className="h-10 w-20 rounded-lg border-2 border-[#9eb4c7] bg-white px-2 py-1 text-center text-base font-semibold disabled:bg-slate-100"
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                            <div className="text-sm text-[#556b80]">
                              {isBye
                                ? "Bye match: winner is auto-advanced."
                                : winner
                                ? `Winner: ${pairLabel(winner)}`
                                : !match.is_unlocked
                                ? "Locked"
                                : "Awaiting result"}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="rounded-lg border border-[#9db4c8] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--cool)] shadow-sm disabled:opacity-50"
                        disabled={!stageUnlocked}
                      >
                        Save stage results
                      </button>
                    </div>
                    {stageUnlocked ? (
                      <FloatingFormSave
                        formId={stageFormId}
                        label={`Save ${knockoutStageLabel(stage, totalStages)}`}
                      />
                    ) : null}
                  </form>
                </div>
              </CollapsibleSection>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

export default async function ClubChampsKnockoutMatchesPage({
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
  const { data: poolData, error: poolError } = await db
    .from("club_champs_pool_matches")
    .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score");
  const { data: knockoutData, error: knockoutError } = await db
    .from("club_champs_knockout_matches")
    .select("id,event,stage,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,game_scores,winner_pair_id,best_of,is_unlocked")
    .order("event", { ascending: true })
    .order("stage", { ascending: true })
    .order("match_order", { ascending: true });

  const pairs = (pairData ?? []) as PairRow[];
  const poolMatches = (poolData ?? []) as PoolMatchRow[];
  const knockoutRows = (knockoutData ?? []) as KnockoutMatchRow[];
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  const levelPoolCount = new Set(poolMatches.filter((m) => m.event === "level_doubles").map((m) => m.pool_number))
    .size;
  const mixedPoolCount = new Set(poolMatches.filter((m) => m.event === "mixed_doubles").map((m) => m.pool_number))
    .size;
  const levelTotal = pairs.filter((p) => p.event === "level_doubles").length;
  const mixedTotal = pairs.filter((p) => p.event === "mixed_doubles").length;
  const advanceLevel = resolveAdvanceCount(params.advance_level, levelTotal, levelPoolCount);
  const advanceMixed = resolveAdvanceCount(params.advance_mixed, mixedTotal, mixedPoolCount);

  const levelComputation = computeEventFromPools({
    event: "level_doubles",
    pairs,
    matches: poolMatches,
    advanceCount: advanceLevel,
  });
  const mixedComputation = computeEventFromPools({
    event: "mixed_doubles",
    pairs,
    matches: poolMatches,
    advanceCount: advanceMixed,
  });

  const redirect = `/admin/club-champs/knockout-matches?advance_level=${advanceLevel}&advance_mixed=${advanceMixed}`;

  return (
    <div className="max-w-6xl space-y-5">
      <HashAnchorRestore />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Step 5: Knockout matches</h1>
        <p className="text-sm text-[var(--muted)]">
          Generate level/mixed knockout brackets separately, then save all match results in a stage to unlock the next stage.
        </p>
      </div>

      <CollapsibleSection
        id="knockout-generate-controls"
        title="Knockout generation controls"
        subtitle="Generate or regenerate knockout brackets for each event."
      >
        <InitKnockoutForm
          advanceLevel={advanceLevel}
          advanceMixed={advanceMixed}
          maxLevel={levelComputation.poolRows.reduce((sum, pool) => sum + pool.standings.length, 0)}
          maxMixed={mixedComputation.poolRows.reduce((sum, pool) => sum + pool.standings.length, 0)}
        />
        <p className="mt-2 text-xs text-[var(--muted)]">
          Resetting rebuilds knockout rounds from current pool standings and clears existing knockout results.
        </p>
      </CollapsibleSection>

      {params.initialized && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          {params.initialized_event === "level_doubles"
            ? "Level doubles knockout generated."
            : params.initialized_event === "mixed_doubles"
            ? "Mixed doubles knockout generated."
            : "Knockout matches generated."}
        </p>
      )}
      {params.updated && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          Knockout stage results saved.
        </p>
      )}
      {params.format_saved && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          Stage format updated.
        </p>
      )}
      {params.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      {pairError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pairs: {pairError.message}
        </p>
      )}
      {poolError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pool data: {poolError.message}
        </p>
      )}
      {knockoutError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load knockout matches: {knockoutError.message}
        </p>
      )}

      <KnockoutEventResultsClient
        event="level_doubles"
        initialRows={knockoutRows.filter((row) => row.event === "level_doubles")}
        pairs={pairs}
        redirect={redirect}
      />
      <KnockoutEventResultsClient
        event="mixed_doubles"
        initialRows={knockoutRows.filter((row) => row.event === "mixed_doubles")}
        pairs={pairs}
        redirect={redirect}
      />
    </div>
  );
}
