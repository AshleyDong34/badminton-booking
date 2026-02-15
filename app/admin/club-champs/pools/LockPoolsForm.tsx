"use client";

import type { FormEvent } from "react";

type Props = {
  levelPoolTarget: 3 | 4;
  mixedPoolTarget: 3 | 4;
};

export function LockPoolsForm({ levelPoolTarget, mixedPoolTarget }: Props) {
  function onSubmit(event: FormEvent<HTMLFormElement>, eventLabel: string) {
    const confirmed = window.confirm(
      `This will reset and regenerate ${eventLabel} pool matches and clear entered scores for that event. Continue?`
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form
        action="/api/admin/champs/pools/lock"
        method="post"
        className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-3"
        onSubmit={(event) => onSubmit(event, "level doubles")}
      >
        <input type="hidden" name="event" value="level_doubles" />
        <input type="hidden" name="mixed_pool_target" value={String(mixedPoolTarget)} />
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

        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Generate level doubles pools
        </button>
      </form>

      <form
        action="/api/admin/champs/pools/lock"
        method="post"
        className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-3"
        onSubmit={(event) => onSubmit(event, "mixed doubles")}
      >
        <input type="hidden" name="event" value="mixed_doubles" />
        <input type="hidden" name="level_pool_target" value={String(levelPoolTarget)} />
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

        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Generate mixed doubles pools
        </button>
      </form>
      <div className="md:col-span-2">
        <p className="text-xs text-[var(--muted)]">
          Pools are balanced to keep sizes between 3 and 4 where possible.
        </p>
        <p className="text-xs text-[var(--muted)]">
          Regenerating an event replaces pool fixtures/scores for that event and resets knockout for that event.
        </p>
      </div>
    </div>
  );
}
