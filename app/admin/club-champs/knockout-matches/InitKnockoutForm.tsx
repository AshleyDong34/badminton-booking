"use client";

import type { FormEvent } from "react";

type Props = {
  advanceLevel: number;
  advanceMixed: number;
  maxLevel: number;
  maxMixed: number;
};

export function InitKnockoutForm({ advanceLevel, advanceMixed, maxLevel, maxMixed }: Props) {
  function onSubmit(event: FormEvent<HTMLFormElement>, label: string) {
    const confirmed = window.confirm(
      `This will reset and regenerate ${label} knockout matches and clear existing knockout results for that event. Continue?`
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form
        action="/api/admin/champs/knockout/init"
        method="post"
        className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-3"
        onSubmit={(event) => onSubmit(event, "level doubles")}
      >
        <input type="hidden" name="redirect" value="/admin/club-champs/knockout-matches" />
        <input type="hidden" name="event" value="level_doubles" />
        <input type="hidden" name="advance_mixed" value={advanceMixed} />
        <label className="text-xs font-medium text-[var(--muted)]">
          Level doubles: advance to knockout
          <input
            name="advance_level"
            type="number"
            min={0}
            max={maxLevel}
            defaultValue={advanceLevel}
            className="mt-1 block w-24 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
          />
        </label>
        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Generate level knockout
        </button>
      </form>

      <form
        action="/api/admin/champs/knockout/init"
        method="post"
        className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-3"
        onSubmit={(event) => onSubmit(event, "mixed doubles")}
      >
        <input type="hidden" name="redirect" value="/admin/club-champs/knockout-matches" />
        <input type="hidden" name="event" value="mixed_doubles" />
        <input type="hidden" name="advance_level" value={advanceLevel} />
        <label className="text-xs font-medium text-[var(--muted)]">
          Mixed doubles: advance to knockout
          <input
            name="advance_mixed"
            type="number"
            min={0}
            max={maxMixed}
            defaultValue={advanceMixed}
            className="mt-1 block w-24 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
          />
        </label>
        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Generate mixed knockout
        </button>
      </form>
    </div>
  );
}
