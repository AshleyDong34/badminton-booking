"use client";

import type { FormEvent } from "react";

type Props = {
  levelPoolTarget: 3 | 4;
  mixedPoolTarget: 3 | 4;
};

export function LockPoolsForm({ levelPoolTarget, mixedPoolTarget }: Props) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      "This will reset and regenerate all pool matches and clear entered scores. Continue?"
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <form action="/api/admin/champs/pools/lock" method="post" className="space-y-3" onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Level doubles target pool size
          </span>
          <select
            name="level_pool_target"
            defaultValue={String(levelPoolTarget)}
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="3">3 (prefer smaller pools)</option>
            <option value="4">4 (prefer larger pools)</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Mixed doubles target pool size
          </span>
          <select
            name="mixed_pool_target"
            defaultValue={String(mixedPoolTarget)}
            className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            <option value="3">3 (prefer smaller pools)</option>
            <option value="4">4 (prefer larger pools)</option>
          </select>
        </label>
      </div>

      <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
        Lock tournament and generate pool matches
      </button>
      <p className="text-xs text-[var(--muted)]">
        Pools are balanced to keep sizes between 3 and 4 where possible.
      </p>
      <p className="text-xs text-[var(--muted)]">
        Regenerating will replace previously generated pool fixtures and scores.
      </p>
    </form>
  );
}
