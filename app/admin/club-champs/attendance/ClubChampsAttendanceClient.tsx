"use client";

import { useEffect, useMemo, useState } from "react";

type EventType = "level_doubles" | "mixed_doubles";
type PlayerSlot = "player_one" | "player_two";

type AttendanceListRow = {
  pair_id: string;
  player_one_present: boolean;
  player_two_present: boolean;
};

type ToggleOk = {
  ok: true;
  rows: AttendanceListRow[];
};

type ListOk = {
  ok: true;
  rows: AttendanceListRow[];
};

type BulkOk = {
  ok: true;
  rows: AttendanceListRow[];
};

type ApiErr = {
  ok: false;
  error: string;
};

export type ClubChampsAttendanceEntry = {
  pairId: string;
  event: EventType;
  playerOneName: string;
  playerTwoName: string;
  playerOnePresent: boolean;
  playerTwoPresent: boolean;
};

const EVENT_LABEL: Record<EventType, string> = {
  level_doubles: "Level doubles",
  mixed_doubles: "Mixed doubles",
};

export default function ClubChampsAttendanceClient({
  initialEntries,
}: {
  initialEntries: ClubChampsAttendanceEntry[];
}) {
  const [entries, setEntries] = useState<ClubChampsAttendanceEntry[]>(initialEntries);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState<null | "mark_all" | "clear_all">(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const grouped = useMemo(
    () => ({
      level: entries.filter((entry) => entry.event === "level_doubles"),
      mixed: entries.filter((entry) => entry.event === "mixed_doubles"),
    }),
    [entries]
  );

  const totalPresent = useMemo(() => {
    let count = 0;
    for (const entry of entries) {
      if (entry.playerOnePresent) count += 1;
      if (entry.playerTwoPresent) count += 1;
    }
    return count;
  }, [entries]);

  const totalPlayers = entries.length * 2;

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const res = await fetch("/api/admin/champs/attendance/list", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) return;
      const payload = (await res.json()) as ListOk | ApiErr;
      if (!payload.ok || cancelled) return;

      const byPair = new Map<string, AttendanceListRow>();
      for (const row of payload.rows) {
        byPair.set(row.pair_id, row);
      }

      setEntries((prev) =>
        prev.map((entry) => {
          const row = byPair.get(entry.pairId);
          if (!row) return entry;
          return {
            ...entry,
            playerOnePresent: Boolean(row.player_one_present),
            playerTwoPresent: Boolean(row.player_two_present),
          };
        })
      );
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, 5000);

    document.addEventListener("visibilitychange", onVisible);
    void refresh();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function updateFromRows(rows: AttendanceListRow[]) {
    const byPair = new Map(rows.map((row) => [row.pair_id, row]));
    setEntries((prev) =>
      prev.map((entry) =>
        byPair.has(entry.pairId)
          ? {
              ...entry,
              playerOnePresent: Boolean(byPair.get(entry.pairId)?.player_one_present),
              playerTwoPresent: Boolean(byPair.get(entry.pairId)?.player_two_present),
            }
          : entry
      )
    );
  }

  async function toggleAttendance(
    pairId: string,
    slot: PlayerSlot,
    present: boolean
  ) {
    const key = `${pairId}:${slot}`;
    setError("");
    setMessage("");

    let previous = false;
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.pairId !== pairId) return entry;
        previous =
          slot === "player_one" ? entry.playerOnePresent : entry.playerTwoPresent;
        return slot === "player_one"
          ? { ...entry, playerOnePresent: present }
          : { ...entry, playerTwoPresent: present };
      })
    );
    setSavingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      const res = await fetch("/api/admin/champs/attendance/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairId, slot, present }),
      });

      const payload = (await res.json()) as ToggleOk | ApiErr;
      if (!res.ok || !payload.ok) {
        setEntries((prev) =>
          prev.map((entry) => {
            if (entry.pairId !== pairId) return entry;
            return slot === "player_one"
              ? { ...entry, playerOnePresent: previous }
              : { ...entry, playerTwoPresent: previous };
          })
        );
        setError(payload.ok ? "Failed to save attendance." : payload.error);
        return;
      }

      updateFromRows(payload.rows);
      setMessage("Attendance updated.");
    } catch {
      setEntries((prev) =>
        prev.map((entry) => {
          if (entry.pairId !== pairId) return entry;
          return slot === "player_one"
            ? { ...entry, playerOnePresent: previous }
            : { ...entry, playerTwoPresent: previous };
        })
      );
      setError("Network error while updating attendance.");
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function applyBulk(present: boolean) {
    setError("");
    setMessage("");
    setBulkSaving(present ? "mark_all" : "clear_all");
    try {
      const res = await fetch("/api/admin/champs/attendance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ present }),
      });

      const payload = (await res.json()) as BulkOk | ApiErr;
      if (!res.ok || !payload.ok) {
        setError(payload.ok ? "Failed to update attendance." : payload.error);
        return;
      }

      updateFromRows(payload.rows);
      setMessage(present ? "All players marked present." : "All attendance cleared.");
    } catch {
      setError("Network error while updating attendance.");
    } finally {
      setBulkSaving(null);
    }
  }

  function onClearAll() {
    const confirmed = window.confirm("Clear all attendance checkmarks?");
    if (!confirmed) return;
    void applyBulk(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3">
        <span className="text-sm text-[var(--ink)]">
          Checked in: {totalPresent}/{totalPlayers}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void applyBulk(true)}
            disabled={bulkSaving !== null}
            className="rounded-full bg-[var(--ok)] px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkSaving === "mark_all" ? "Saving..." : "Mark all present"}
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={bulkSaving !== null}
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkSaving === "clear_all" ? "Saving..." : "Clear all"}
          </button>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <EventAttendanceSection
        title={EVENT_LABEL.level_doubles}
        entries={grouped.level}
        savingKeys={savingKeys}
        onToggle={toggleAttendance}
      />
      <EventAttendanceSection
        title={EVENT_LABEL.mixed_doubles}
        entries={grouped.mixed}
        savingKeys={savingKeys}
        onToggle={toggleAttendance}
      />
    </div>
  );
}

function EventAttendanceSection({
  title,
  entries,
  savingKeys,
  onToggle,
}: {
  title: string;
  entries: ClubChampsAttendanceEntry[];
  savingKeys: Set<string>;
  onToggle: (pairId: string, slot: PlayerSlot, present: boolean) => Promise<void>;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-[var(--muted)]">{entries.length} pairs</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No pairs for this event.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map((entry) => (
            <div
              key={entry.pairId}
              className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-3"
            >
              <PlayerRow
                pairId={entry.pairId}
                slot="player_one"
                name={entry.playerOneName}
                checked={entry.playerOnePresent}
                savingKeys={savingKeys}
                onToggle={onToggle}
              />
              <PlayerRow
                pairId={entry.pairId}
                slot="player_two"
                name={entry.playerTwoName}
                checked={entry.playerTwoPresent}
                savingKeys={savingKeys}
                onToggle={onToggle}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlayerRow({
  pairId,
  slot,
  name,
  checked,
  savingKeys,
  onToggle,
}: {
  pairId: string;
  slot: PlayerSlot;
  name: string;
  checked: boolean;
  savingKeys: Set<string>;
  onToggle: (pairId: string, slot: PlayerSlot, present: boolean) => Promise<void>;
}) {
  const key = `${pairId}:${slot}`;
  const saving = savingKeys.has(key);

  return (
    <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={(event) => {
          void onToggle(pairId, slot, event.target.checked);
        }}
        className="h-4 w-4"
      />
      <span className="font-medium text-[var(--ink)]">{name}</span>
      {saving ? <span className="ml-auto text-xs text-[var(--muted)]">Saving...</span> : null}
    </label>
  );
}
