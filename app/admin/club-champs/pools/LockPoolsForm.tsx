"use client";

import type { FormEvent } from "react";

export function LockPoolsForm() {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      "This will reset and regenerate all pool matches and clear entered scores. Continue?"
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <form action="/api/admin/champs/pools/lock" method="post" className="space-y-2" onSubmit={onSubmit}>
      <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
        Lock tournament and generate pool matches
      </button>
      <p className="text-xs text-[var(--muted)]">
        Regenerating will replace previously generated pool fixtures and scores.
      </p>
    </form>
  );
}
