"use client";

import { useEffect, useState } from "react";
import {
  EVENT_LABEL,
  knockoutStageLabel,
  pairLabel,
  type EventType,
  type PairRow,
} from "@/lib/club-champs-knockout";
import CollapsibleSection from "../CollapsibleSection";
import FloatingFormSave from "../FloatingFormSave";
import { supabase } from "@/lib/supabaseClient";

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

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string };

function eventMatchesByStage(rows: KnockoutMatchRow[]) {
  const byStage = new Map<number, KnockoutMatchRow[]>();
  for (const row of rows) {
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
  if (aStrength < bStrength) return { pairAStart: -handicap, pairBStart: 0 };
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

export default function KnockoutEventResultsClient({
  event,
  initialRows,
  pairs,
  redirect,
}: {
  event: EventType;
  initialRows: KnockoutMatchRow[];
  pairs: PairRow[];
  redirect: string;
}) {
  const [rows, setRows] = useState<KnockoutMatchRow[]>(initialRows);
  const [savingStage, setSavingStage] = useState<number | null>(null);
  const [savingFormatStage, setSavingFormatStage] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  const stages = eventMatchesByStage(rows);
  const totalStages = stages.length;
  const finalStage = stages[totalStages - 1];
  const finalWinnerId = finalStage?.matches[0]?.winner_pair_id ?? null;
  const winnerPair = finalWinnerId ? pairById.get(finalWinnerId) : null;
  const eventComplete = Boolean(winnerPair);
  const eventSubtitle = winnerPair
    ? `Winner: ${pairLabel(winnerPair)}. Completed and hidden by default.`
    : "Winner not decided yet.";

  useEffect(() => {
    let cancelled = false;

    const refreshRows = async () => {
      const { data, error } = await supabase
        .from("club_champs_knockout_matches")
        .select("id,event,stage,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,game_scores,winner_pair_id,best_of,is_unlocked")
        .eq("event", event)
        .order("stage", { ascending: true })
        .order("match_order", { ascending: true });

      if (cancelled || error || !data) return;
      setRows(data as KnockoutMatchRow[]);
    };

    const channel = supabase
      .channel(`admin-club-champs-knockout-${event}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_champs_knockout_matches" },
        (payload) => {
          const nextRow = (payload.new ?? {}) as Record<string, unknown>;
          const oldRow = (payload.old ?? {}) as Record<string, unknown>;
          const changedEvent = String(nextRow.event ?? oldRow.event ?? "");
          if (changedEvent && changedEvent !== event) return;
          void refreshRows();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [event]);

  async function saveStage(stage: number, form: HTMLFormElement) {
    setSavingStage(stage);
    setMessage(null);
    try {
      const formData = new FormData(form);
      formData.set("redirect", redirect);
      const response = await fetch("/api/admin/champs/knockout/stage-results/update", {
        method: "POST",
        headers: { "x-admin-fetch": "1" },
        body: formData,
      });
      const payload = (await response.json()) as ApiOk<{ rows: KnockoutMatchRow[] }> | ApiErr;
      if (!response.ok || !payload.ok) {
        setMessage({ type: "error", text: payload.ok ? "Failed to save stage results." : payload.error });
        return;
      }
      setRows(payload.rows ?? []);
      setMessage({ type: "ok", text: `${EVENT_LABEL[event]} stage scores saved.` });
    } catch {
      setMessage({ type: "error", text: "Network error while saving stage results." });
    } finally {
      setSavingStage(null);
    }
  }

  async function saveStageFormat(stage: number, form: HTMLFormElement) {
    setSavingFormatStage(stage);
    setMessage(null);
    try {
      const formData = new FormData(form);
      formData.set("redirect", redirect);
      const response = await fetch("/api/admin/champs/knockout/stage-format/update", {
        method: "POST",
        headers: { "x-admin-fetch": "1" },
        body: formData,
      });
      const payload = (await response.json()) as ApiOk<{ stage: number; best_of: 1 | 3 }> | ApiErr;
      if (!response.ok || !payload.ok) {
        setMessage({ type: "error", text: payload.ok ? "Failed to save stage format." : payload.error });
        return;
      }

      setRows((prev) =>
        prev.map((row) =>
          row.stage === payload.stage
            ? {
                ...row,
                best_of: payload.best_of,
              }
            : row
        )
      );
      setMessage({ type: "ok", text: "Stage format updated." });
    } catch {
      setMessage({ type: "error", text: "Network error while saving stage format." });
    } finally {
      setSavingFormatStage(null);
    }
  }

  return (
    <CollapsibleSection
      id={`knockout-event-${event}`}
      title={`${EVENT_LABEL[event]} knockout`}
      subtitle={eventSubtitle}
      defaultOpen={!eventComplete}
    >
      {message ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

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
            const isSaving = savingStage === stage;
            const isSavingFormat = savingFormatStage === stage;

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
                  className={`mx-auto w-full max-w-5xl space-y-4 rounded-2xl border p-3 scroll-mt-24 sm:p-5 ${
                    stageUnlocked
                      ? "border-[#a7c1ad] bg-gradient-to-br from-[#f9fcf8] to-[#f2f7f2]"
                      : "border-slate-300 bg-slate-100/80"
                  }`}
                >
                  <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-[#cfdccc] bg-[#fefefd] px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="space-y-1">
                      <div
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                          stageComplete
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : stageUnlocked
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-slate-300 bg-slate-100 text-slate-700"
                        }`}
                      >
                        {stageComplete ? "Complete" : stageUnlocked ? "Open for scoring" : "Locked"}
                      </div>
                      <p className="text-xs text-[#546551]">
                        {bestOf === 3
                          ? "Best of 3: enter game scores until one pair wins 2 games."
                          : "Single game: enter one match score per pair."}
                      </p>
                    </div>
                    <form
                      action="/api/admin/champs/knockout/stage-format/update"
                      method="post"
                      className="flex w-full flex-wrap items-end gap-2 sm:w-auto sm:flex-nowrap"
                      onSubmit={async (eventSubmit) => {
                        eventSubmit.preventDefault();
                        await saveStageFormat(stage, eventSubmit.currentTarget);
                      }}
                    >
                      <input type="hidden" name="event" value={event} />
                      <input type="hidden" name="stage" value={stage} />
                      <input type="hidden" name="redirect" value={redirect} />
                      <input type="hidden" name="anchor" value={stageAnchor} />
                      <label className="grow text-xs font-medium text-[var(--muted)] sm:grow-0">
                        Match format
                        <select
                          name="best_of"
                          defaultValue={bestOf}
                          disabled={isSavingFormat}
                          className="mt-1 block w-full rounded-lg border border-[#a8baa6] bg-white px-2 py-1 text-sm sm:w-auto"
                        >
                          <option value="1">1 game to win</option>
                          <option value="3">Best of 3</option>
                        </select>
                      </label>
                      <button
                        disabled={isSavingFormat}
                          className="rounded-lg border border-[#a3b7a2] bg-[#f6faf4] px-3 py-1.5 text-xs font-medium text-[var(--cool)] shadow-sm disabled:opacity-50"
                      >
                        {isSavingFormat ? "Saving..." : "Save format"}
                      </button>
                    </form>
                  </div>

                  <form
                    id={stageFormId}
                    action="/api/admin/champs/knockout/stage-results/update"
                    method="post"
                    className="space-y-3"
                    onSubmit={async (eventSubmit) => {
                      eventSubmit.preventDefault();
                      await saveStage(stage, eventSubmit.currentTarget);
                    }}
                  >
                    <input type="hidden" name="event" value={event} />
                    <input type="hidden" name="stage" value={stage} />
                    <input type="hidden" name="anchor" value={stageAnchor} />

                    <div className="grid gap-4 xl:grid-cols-2">
                      {matches.map((match) => {
                        const pairA = match.pair_a_id ? pairById.get(match.pair_a_id) : null;
                        const pairB = match.pair_b_id ? pairById.get(match.pair_b_id) : null;
                        const canScore = !!(match.is_unlocked && pairA && pairB);
                        const isBye = (pairA && !pairB) || (!pairA && pairB);
                        const winner = match.winner_pair_id ? pairById.get(match.winner_pair_id) : null;
                        const games = matchGames(match);
                        const fullyScored = isMatchFullyScored(match);
                        const starts = handicapStarts(pairA ?? undefined, pairB ?? undefined);
                        const stateLabel = winner
                          ? "Winner set"
                          : !match.is_unlocked
                          ? "Locked"
                          : "Awaiting result";
                        const stateClass = winner
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : !match.is_unlocked
                          ? "border-slate-300 bg-slate-200 text-slate-700"
                          : "border-amber-300 bg-amber-50 text-amber-900";

                        return (
                          <article
                            key={match.id}
                            className={`w-full min-w-0 space-y-3 overflow-hidden rounded-2xl border p-3 shadow-sm sm:p-4 ${
                              fullyScored
                                ? "border-emerald-300 bg-emerald-50/60"
                                : canScore
                                ? "border-[#9db89e] bg-white"
                                : "border-slate-300 bg-slate-100/70"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="rounded-full border border-[#d1dccf] bg-[#f4f8f2] px-2.5 py-1 text-xs font-semibold text-[#4f644f]">
                                Match {match.match_order}
                              </div>
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass}`}>
                                {stateLabel}
                              </span>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="min-w-0 rounded-xl border border-[#b8d8bf] bg-[#effaf1] px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#446245]">
                                  Pair A
                                </p>
                                <p className="break-words text-sm font-medium">{pairA ? pairLabel(pairA) : "TBD"}</p>
                                {pairA && starts ? (
                                  <span className="mt-1 inline-block rounded-full border border-[#a9cfb3] bg-white px-2 py-0.5 text-xs font-medium text-[#2f6b3c]">
                                    start {starts.pairAStart}
                                  </span>
                                ) : null}
                              </div>
                              <div className="min-w-0 rounded-xl border border-[#e1cfab] bg-[#fff8ea] px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b5635]">
                                  Pair B
                                </p>
                                <p className="break-words text-sm font-medium">{pairB ? pairLabel(pairB) : "BYE"}</p>
                                {pairB && starts ? (
                                  <span className="mt-1 inline-block rounded-full border border-[#e2caa2] bg-white px-2 py-0.5 text-xs font-medium text-[#835b1f]">
                                    start {starts.pairBStart}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {isBye ? (
                              <p className="rounded-xl border border-[#d4dfd2] bg-white px-3 py-2 text-sm font-medium text-[#53694f]">
                                No score entry needed for a bye match.
                              </p>
                            ) : (
                              <div className="rounded-xl border border-[#d4dfd2] bg-[#fbfdfa] p-3">
                                <div className="mx-auto w-full max-w-full sm:max-w-[420px]">
                                  <div className="grid grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#546551] sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
                                    <span>Game</span>
                                    <span className="rounded-md bg-[#e6f6ea] px-2 py-1 text-center text-[#2f6b3c]">
                                      Pair A
                                    </span>
                                    <span className="rounded-md bg-[#fff2df] px-2 py-1 text-center text-[#835b1f]">
                                      Pair B
                                    </span>
                                  </div>
                                  <div className="space-y-2">
                                    {games.map((game, index) => (
                                      <div
                                        key={`${match.id}-g-${index + 1}`}
                                        className="grid grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg border border-[#d7e2d5] bg-white px-2 py-2 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]"
                                      >
                                        <span className="text-xs font-semibold text-[#546551]">
                                          {match.best_of === 1 ? "Match" : `Game ${index + 1}`}
                                        </span>
                                        <div className="flex justify-center">
                                          <input
                                            key={`a-${match.id}-${index + 1}-${game.a ?? "blank"}`}
                                            name={`game_${match.id}_${index + 1}_a`}
                                            type="number"
                                            min={0}
                                            defaultValue={game.a ?? ""}
                                            disabled={!canScore || isSaving}
                                            data-track-save="1"
                                            className="h-10 w-full max-w-[72px] rounded-lg border-2 border-[#86b28f] bg-white px-2 py-1 text-center text-base font-semibold disabled:bg-slate-100 sm:max-w-[80px]"
                                          />
                                        </div>
                                        <div className="flex justify-center">
                                          <input
                                            key={`b-${match.id}-${index + 1}-${game.b ?? "blank"}`}
                                            name={`game_${match.id}_${index + 1}_b`}
                                            type="number"
                                            min={0}
                                            defaultValue={game.b ?? ""}
                                            disabled={!canScore || isSaving}
                                            data-track-save="1"
                                            className="h-10 w-full max-w-[72px] rounded-lg border-2 border-[#cfad76] bg-white px-2 py-1 text-center text-base font-semibold disabled:bg-slate-100 sm:max-w-[80px]"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="rounded-lg border border-[#d5dfd3] bg-white px-3 py-2 text-sm font-medium text-[#53694f]">
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
                        className="rounded-lg border border-[#9fb4a0] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--cool)] shadow-sm disabled:opacity-50"
                        disabled={!stageUnlocked || isSaving}
                      >
                        {isSaving ? "Saving..." : "Save stage results"}
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
