"use client";

import type { FormEvent } from "react";

type Props = {
  advanceLevel: number;
  advanceMixed: number;
  maxLevel: number;
  maxMixed: number;
};

export function InitKnockoutForm({ advanceLevel, advanceMixed, maxLevel, maxMixed }: Props) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      "This will reset and regenerate all knockout matches and clear existing knockout results. Continue?"
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <form
      action="/api/admin/champs/knockout/init"
      method="post"
      className="flex flex-wrap items-end gap-3"
      onSubmit={onSubmit}
    >
      <input type="hidden" name="redirect" value="/admin/club-champs/knockout-matches" />
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
        Generate / reset knockout matches
      </button>
    </form>
  );
}
