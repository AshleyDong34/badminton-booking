"use client";

import type { FormEvent } from "react";

export function FinalizeActions() {
  function onFinalizeSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      "This will permanently clear all Club Champs pairs, pools, and knockout data, and hide Club Champs from public view. Continue?"
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Export full data (Excel)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Downloads all Club Champs sections as clearly labeled sheets with color coding.
        </p>
        <a
          href="/api/admin/champs/export"
          className="mt-3 inline-block rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          Export Club Champs workbook
        </a>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-red-800">Finalize and reset tournament</h2>
        <p className="mt-1 text-sm text-red-700">
          Use this after tournament is finished. It clears all Club Champs data so you can start fresh next time.
        </p>
        <form
          action="/api/admin/champs/finalize"
          method="post"
          onSubmit={onFinalizeSubmit}
          className="mt-3"
        >
          <input type="hidden" name="redirect" value="/admin/club-champs/finalize" />
          <button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Finalize Club Champs
          </button>
        </form>
      </section>
    </div>
  );
}

