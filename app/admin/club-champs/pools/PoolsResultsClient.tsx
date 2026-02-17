"use client";

import { useEffect, useMemo, useState } from "react";
import FloatingFormSave from "../FloatingFormSave";
import CollapsibleSection from "../CollapsibleSection";
import { supabase } from "@/lib/supabaseClient";

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
  is_playing: boolean;
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
  if (aStrength < bStrength) return { pairAStart: -handicap, pairBStart: 0 };
  return { pairAStart: 0, pairBStart: -handicap };
}

function poolName(index: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return `Pool ${alphabet[index]}`;
  return `Pool ${index + 1}`;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function pairPlayers(pair: Row | undefined) {
  if (!pair) return [];
  return [normalizeName(pair.player_one_name), normalizeName(pair.player_two_name)].filter(Boolean);
}

function computeRecommendedMatches(matches: MatchRow[], pairById: Map<string, Row>) {
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

  const recommendedByEvent = new Map<EventType, MatchRow>();
  const inPlayMatchesByEvent = new Map<EventType, number>();
  const events: EventType[] = ["level_doubles", "mixed_doubles"];
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

    const candidateScore = (match: MatchRow) => {
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
    inPlayTotal: matches.filter((match) => match.is_playing).length,
    busyPlayersCount: busyPlayers.size,
  };
}

function isEventFinished(matches: MatchRow[], event: EventType) {
  const eventMatches = matches.filter((match) => match.event === event);
  return (
    eventMatches.length > 0 &&
    eventMatches.every((match) => match.pair_a_score != null && match.pair_b_score != null)
  );
}

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string };

export default function PoolsResultsClient({
  initialMatches,
  rows,
  redirect,
}: {
  initialMatches: MatchRow[];
  rows: Row[];
  redirect: string;
}) {
  const [matches, setMatches] = useState<MatchRow[]>(initialMatches);
  const [savingEvent, setSavingEvent] = useState<EventType | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const pairById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const recommendation = useMemo(() => computeRecommendedMatches(matches, pairById), [matches, pairById]);
  const levelFinished = isEventFinished(matches, "level_doubles");
  const mixedFinished = isEventFinished(matches, "mixed_doubles");

  useEffect(() => {
    let cancelled = false;

    const refreshMatches = async () => {
      const { data, error } = await supabase
        .from("club_champs_pool_matches")
        .select("id,event,pool_number,match_order,pair_a_id,pair_b_id,pair_a_score,pair_b_score,is_playing")
        .order("event", { ascending: true })
        .order("pool_number", { ascending: true })
        .order("match_order", { ascending: true });

      if (cancelled || error || !data) return;
      setMatches(data as MatchRow[]);
    };

    const channel = supabase
      .channel(`admin-club-champs-pools-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "club_champs_pool_matches" },
        () => {
          void refreshMatches();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!errorModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [errorModal]);

  const setEventMatches = (event: EventType, nextEventMatches: MatchRow[]) => {
    const nextById = new Map(nextEventMatches.map((match) => [match.id, match]));
    setMatches((prev) =>
      prev
        .map((row) => (row.event === event ? (nextById.get(row.id) ?? row) : row))
        .sort((a, b) => {
          if (a.event !== b.event) return a.event.localeCompare(b.event);
          if (a.pool_number !== b.pool_number) return a.pool_number - b.pool_number;
          return a.match_order - b.match_order;
        })
    );
  };

  async function onSaveEvent(event: EventType, form: HTMLFormElement) {
    setSavingEvent(event);
    setMessage(null);
    try {
      const formData = new FormData(form);
      formData.set("event", event);
      formData.set("redirect", redirect);
      const response = await fetch("/api/admin/champs/pools/matches/bulk-update", {
        method: "POST",
        headers: { "x-admin-fetch": "1" },
        body: formData,
      });
      const payload = (await response.json()) as ApiOk<{ matches: MatchRow[] }> | ApiErr;
      if (!response.ok || !payload.ok) {
        setErrorModal(payload.ok ? "Failed to save pool scores." : payload.error);
        return;
      }
      setEventMatches(event, payload.matches ?? []);
      setMessage({ type: "ok", text: `${EVENT_LABEL[event]} pool scores saved.` });
    } catch {
      setErrorModal("Network error while saving scores.");
    } finally {
      setSavingEvent(null);
    }
  }

  async function onTogglePlaying(match: MatchRow) {
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("match_id", match.id);
      formData.set("redirect", redirect);
      const response = await fetch("/api/admin/champs/pools/matches/toggle-playing", {
        method: "POST",
        headers: { "x-admin-fetch": "1" },
        body: formData,
      });
      const payload =
        (await response.json()) as ApiOk<{ match: Pick<MatchRow, "id" | "is_playing" | "pool_number" | "match_order" | "event"> }> | ApiErr;
      if (!response.ok || !payload.ok) {
        setErrorModal(payload.ok ? "Failed to update playing status." : payload.error);
        return;
      }
      setMatches((prev) =>
        prev.map((row) =>
          row.id === payload.match.id
            ? {
                ...row,
                is_playing: payload.match.is_playing,
              }
            : row
        )
      );
    } catch {
      setErrorModal("Network error while updating playing status.");
    }
  }

  return (
    <div className="space-y-4">
      {errorModal ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pool-error-title"
            className="w-full max-w-md rounded-2xl border border-red-300 bg-white p-5 shadow-2xl"
          >
            <h3 id="pool-error-title" className="text-lg font-semibold text-red-800">
              Pool update error
            </h3>
            <p className="mt-2 text-sm text-red-700">{errorModal}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setErrorModal(null)}
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      <p className="text-sm text-[var(--muted)]">
        Numbers shown next to each pair name are that pair&apos;s starting points for the match.
      </p>
      <p className="text-sm text-[var(--muted)]">
        Use the global save button to save all entered scores at once. Green match cards mean those scores are saved.
      </p>
      <p className="text-sm text-[var(--muted)]">
        Orange cards are currently in play. Recommended next avoids in-play player clashes and prioritizes fairness:
        underplayed players/pairs first, then those with more matches still to complete.
        {recommendation.busyPlayersCount > 0
          ? ` (${recommendation.busyPlayersCount} players currently in play)`
          : ""}
        {recommendation.inPlayTotal > 0
          ? ` (${recommendation.inPlayTotal} matches currently in play)`
          : ""}
      </p>

      <CollapsibleSection
        id="pools-results-level"
        title="Level doubles results"
        subtitle={levelFinished ? "Completed. Hidden by default after completion." : "In progress."}
        defaultOpen={!levelFinished}
      >
        <EventMatchResults
          event="level_doubles"
          matches={matches}
          pairById={pairById}
          recommendedMatchId={recommendation.recommendedByEvent.get("level_doubles")?.id ?? null}
          inPlayCount={recommendation.inPlayMatchesByEvent.get("level_doubles") ?? 0}
          isSaving={savingEvent === "level_doubles"}
          onSaveEvent={onSaveEvent}
          onTogglePlaying={onTogglePlaying}
        />
      </CollapsibleSection>
      <CollapsibleSection
        id="pools-results-mixed"
        title="Mixed doubles results"
        subtitle={mixedFinished ? "Completed. Hidden by default after completion." : "In progress."}
        defaultOpen={!mixedFinished}
      >
        <EventMatchResults
          event="mixed_doubles"
          matches={matches}
          pairById={pairById}
          recommendedMatchId={recommendation.recommendedByEvent.get("mixed_doubles")?.id ?? null}
          inPlayCount={recommendation.inPlayMatchesByEvent.get("mixed_doubles") ?? 0}
          isSaving={savingEvent === "mixed_doubles"}
          onSaveEvent={onSaveEvent}
          onTogglePlaying={onTogglePlaying}
        />
      </CollapsibleSection>
    </div>
  );
}

function EventMatchResults({
  event,
  matches,
  pairById,
  recommendedMatchId,
  inPlayCount,
  isSaving,
  onSaveEvent,
  onTogglePlaying,
}: {
  event: EventType;
  matches: MatchRow[];
  pairById: Map<string, Row>;
  recommendedMatchId: string | null;
  inPlayCount: number;
  isSaving: boolean;
  onSaveEvent: (event: EventType, form: HTMLFormElement) => Promise<void>;
  onTogglePlaying: (match: MatchRow) => Promise<void>;
}) {
  const eventMatches = matches.filter((m) => m.event === event);
  const pools = new Map<number, MatchRow[]>();
  const eventAnchor = `pool-results-${event}`;
  const formId = `pool-results-form-${event}`;

  for (const match of eventMatches) {
    const list = pools.get(match.pool_number) ?? [];
    list.push(match);
    pools.set(match.pool_number, list);
  }

  return (
    <section className="space-y-3" id={eventAnchor}>
      <h3 className="text-lg font-semibold">{EVENT_LABEL[event]} results entry</h3>
      <p className="rounded-xl border border-[#f1b56e] bg-[#fff3e4] px-3 py-2 text-sm text-[#8a5a20]">
        {inPlayCount > 0
          ? `${inPlayCount} matches currently in play for ${EVENT_LABEL[event]}.`
          : `No matches currently in play for ${EVENT_LABEL[event]}.`}
      </p>
      {recommendedMatchId ? (
        <p className="rounded-xl border border-[#e7d35b] bg-[#fffbe3] px-3 py-2 text-sm text-[#7a6715]">
          Recommended next: match highlighted with yellow border.
        </p>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm text-[var(--muted)]">
          No recommended next match right now (all available pairs may already be in play or scored).
        </p>
      )}

      {pools.size === 0 ? (
        <p className="text-sm text-[var(--muted)]">No fixtures for this event.</p>
      ) : (
        <form
          id={formId}
          action="/api/admin/champs/pools/matches/bulk-update"
          method="post"
          className="space-y-4"
          onSubmit={async (eventSubmit) => {
            eventSubmit.preventDefault();
            await onSaveEvent(event, eventSubmit.currentTarget);
          }}
        >
          <input type="hidden" name="event" value={event} />
          <input type="hidden" name="anchor" value={eventAnchor} />

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
                      const isActiveInPlay = match.is_playing && !isSaved;
                      const isRecommended = recommendedMatchId === match.id;
                      const rowId = `pool-${event}-${poolNumber}-match-${match.match_order}`;
                      return (
                        <div
                          key={match.id}
                          id={rowId}
                          className={`scroll-mt-24 space-y-2 rounded-xl border-2 p-3 ${
                            isSaved
                              ? "border-emerald-400 bg-emerald-50/60"
                              : isActiveInPlay
                              ? "border-[#f59e0b] bg-[#fff4e7]"
                              : isRecommended
                              ? "border-[#e7d35b] bg-[#fffbe8]"
                              : "border-[#a2b8cb] bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-xs font-semibold text-[#4e6279]">Match {match.match_order}</div>
                            <div className="flex items-center gap-2">
                              {isSaved ? (
                                <span className="rounded-full border border-emerald-400 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  Saved
                                </span>
                              ) : isActiveInPlay ? (
                                <span className="rounded-full border border-[#f59e0b] bg-[#fde4bf] px-2 py-0.5 text-xs font-semibold text-[#8a5a20]">
                                  In play
                                </span>
                              ) : isRecommended ? (
                                <span className="rounded-full border border-[#e7d35b] bg-[#fff7d1] px-2 py-0.5 text-xs font-semibold text-[#7a6715]">
                                  Recommended next
                                </span>
                              ) : null}
                              <button
                                type="button"
                                disabled={isSaved || isSaving}
                                onClick={() => onTogglePlaying(match)}
                                className={`rounded-lg border px-2 py-0.5 text-xs font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                                  isActiveInPlay
                                    ? "border-[#f59e0b] bg-[#fff1dc] text-[#8a5a20]"
                                    : "border-[#e3c299] bg-white text-[#8a5a20]"
                                }`}
                              >
                                {isSaved ? "Scored" : isActiveInPlay ? "Stop" : "Playing"}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                            <div className="text-sm">
                              <span className="font-semibold text-[var(--cool)]">{pairA?.player_one_name ?? "Pair A"}</span>
                              <span className="text-[var(--muted)]"> + </span>
                              <span className="font-semibold text-[var(--ok)]">{pairA?.player_two_name ?? ""}</span>
                              <span className="text-[var(--muted)]">
                                {" "}
                                ({toLevel(pairA?.player_one_level ?? "")}, {toLevel(pairA?.player_two_level ?? "")})
                              </span>
                              {starts ? (
                                <span className="ml-2 rounded-full border border-[#ccdae8] bg-[var(--chip)] px-2 py-0.5 text-xs text-[var(--muted)]">
                                  start {starts.pairAStart}
                                </span>
                              ) : null}
                            </div>
                            <input
                              key={`a-${match.id}-${match.pair_a_score ?? "blank"}`}
                              name={`pair_a_score__${match.id}`}
                              type="number"
                              min={0}
                              defaultValue={match.pair_a_score ?? ""}
                              data-track-save="1"
                              className="w-24 rounded-lg border-2 border-[#9eb4c7] bg-white px-2 py-1 text-base font-semibold"
                              disabled={isSaving}
                            />
                          </div>

                          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                            <div className="text-sm">
                              <span className="font-semibold text-[var(--cool)]">{pairB?.player_one_name ?? "Pair B"}</span>
                              <span className="text-[var(--muted)]"> + </span>
                              <span className="font-semibold text-[var(--ok)]">{pairB?.player_two_name ?? ""}</span>
                              <span className="text-[var(--muted)]">
                                {" "}
                                ({toLevel(pairB?.player_one_level ?? "")}, {toLevel(pairB?.player_two_level ?? "")})
                              </span>
                              {starts ? (
                                <span className="ml-2 rounded-full border border-[#ccdae8] bg-[var(--chip)] px-2 py-0.5 text-xs text-[var(--muted)]">
                                  start {starts.pairBStart}
                                </span>
                              ) : null}
                            </div>
                            <input
                              key={`b-${match.id}-${match.pair_b_score ?? "blank"}`}
                              name={`pair_b_score__${match.id}`}
                              type="number"
                              min={0}
                              defaultValue={match.pair_b_score ?? ""}
                              data-track-save="1"
                              className="w-24 rounded-lg border-2 border-[#9eb4c7] bg-white px-2 py-1 text-base font-semibold"
                              disabled={isSaving}
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
              className="rounded-lg border border-[#9db4c8] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--cool)] shadow-sm disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save all scores"}
            </button>
          </div>
          <FloatingFormSave formId={formId} label="Save all scores" />
        </form>
      )}
    </section>
  );
}
