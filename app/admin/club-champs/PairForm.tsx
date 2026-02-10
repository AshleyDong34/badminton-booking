"use client";

import { useMemo, useState } from "react";

const LEVEL_OPTIONS = [
  { value: 1, label: "Team 1" },
  { value: 2, label: "Team 2" },
  { value: 3, label: "Team 3" },
  { value: 4, label: "Team 4" },
  { value: 5, label: "Team 5" },
  { value: 6, label: "Team 6" },
  { value: 7, label: "Rec" },
];

type EventType = "level_doubles" | "mixed_doubles";

export default function PairForm() {
  const [event, setEvent] = useState<EventType>("level_doubles");
  const showLevelType = event === "level_doubles";
  const levelTypeHint = useMemo(
    () => (showLevelType ? "Required for level doubles." : "Not used for mixed doubles."),
    [showLevelType]
  );

  return (
    <form
      action="/api/admin/champs/pairs/add"
      method="post"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <input type="hidden" name="redirect" value="/admin/club-champs" />

      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Event</label>
        <select
          name="event"
          required
          value={event}
          onChange={(e) => setEvent(e.target.value as EventType)}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
        >
          <option value="level_doubles">Level doubles</option>
          <option value="mixed_doubles">Mixed doubles</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">
          Level doubles type
        </label>
        <select
          name="level_doubles_type"
          disabled={!showLevelType}
          required={showLevelType}
          defaultValue=""
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm disabled:cursor-not-allowed disabled:bg-[var(--chip)]"
        >
          <option value="" disabled>
            Select
          </option>
          <option value="mens_doubles">Men&apos;s doubles</option>
          <option value="womens_doubles">Women&apos;s doubles</option>
        </select>
        <p className="mt-1 text-xs text-[var(--muted)]">{levelTypeHint}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Player 1</label>
        <input
          name="player_one_name"
          required
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
          placeholder="Full name"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Player 1 level</label>
        <select
          name="player_one_level"
          required
          defaultValue={7}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
        >
          {LEVEL_OPTIONS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Player 2</label>
        <input
          name="player_two_name"
          required
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
          placeholder="Full name"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted)]">Player 2 level</label>
        <select
          name="player_two_level"
          required
          defaultValue={7}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
        >
          {LEVEL_OPTIONS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      <div className="self-end">
        <button className="w-full rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Add pairing
        </button>
      </div>
    </form>
  );
}
