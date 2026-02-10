"use client";

import { useMemo, useState } from "react";

type SeedRow = {
  id: string;
  event: "level_doubles" | "mixed_doubles";
  level_doubles_type: string | null;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  seed_order: number | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function renderLevel(value: number | string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 6) return `Team ${numeric}`;
  if (numeric === 7) return "Rec";
  return String(value ?? "");
}

function seedBand(position: number) {
  if (position === 1) return "1";
  if (position === 2) return "2";

  let upper = 4;
  while (upper < position) upper *= 2;
  const lower = upper / 2 + 1;
  return `${lower}/${upper}`;
}

function reorderRows(rows: SeedRow[], draggedId: string, targetId: string) {
  const sourceIndex = rows.findIndex((r) => r.id === draggedId);
  const targetIndex = rows.findIndex((r) => r.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return rows;

  const next = [...rows];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function SeedList({
  title,
  event,
  rows,
}: {
  title: string;
  event: "level_doubles" | "mixed_doubles";
  rows: SeedRow[];
}) {
  const [items, setItems] = useState(rows);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [savedMessage, setSavedMessage] = useState<string>("Seeding saved.");

  async function saveOrder(nextItems: SeedRow[]) {
    setSaveState("saving");
    setErrorMessage("");
    const res = await fetch("/api/admin/champs/seeds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        ids: nextItems.map((r) => r.id),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      setSaveState("error");
      setErrorMessage(text || "Failed to save seeding order.");
      return;
    }

    const json = await res.json().catch(() => ({}));
    setSavedMessage(
      json?.downstreamReset
        ? "Seeding saved. Pools and knockout for this event were reset."
        : "Seeding saved."
    );
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1400);
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setItems((current) => reorderRows(current, draggedId, targetId));
    setDraggedId(null);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <button
          type="button"
          onClick={() => saveOrder(items)}
          disabled={saveState === "saving" || items.length === 0}
          className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? "Saving..." : "Save seeding"}
        </button>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Drag pairs to reorder. Top row is seed 1, then 2, then shared seed bands (3/4, 5/8, 9/16...).
      </p>

      {saveState === "saved" && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs text-[var(--ink)]">
          {savedMessage}
        </p>
      )}
      {saveState === "error" && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No pairs available.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row, index) => (
            <li
              key={row.id}
              draggable
              onDragStart={() => setDraggedId(row.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(row.id)}
              className="cursor-grab rounded-xl border border-[var(--line)] bg-white px-3 py-2 active:cursor-grabbing"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-[120px] items-center gap-2">
                  <span className="rounded-full bg-[var(--chip)] px-2 py-0.5 text-xs font-semibold">
                    Seed {index + 1}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{seedBand(index + 1)}</span>
                </div>
                <div className="text-sm font-medium">
                  <span className="text-[var(--cool)]">{row.player_one_name}</span>
                  <span className="text-[var(--muted)]"> ({renderLevel(row.player_one_level)})</span>
                  <span className="text-[var(--muted)]"> + </span>
                  <span className="text-[var(--ok)]">{row.player_two_name}</span>
                  <span className="text-[var(--muted)]"> ({renderLevel(row.player_two_level)})</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SeedBoard({
  levelRows,
  mixedRows,
}: {
  levelRows: SeedRow[];
  mixedRows: SeedRow[];
}) {
  const initialLevel = useMemo(() => [...levelRows], [levelRows]);
  const initialMixed = useMemo(() => [...mixedRows], [mixedRows]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Step 2: Seeding</h2>
        <p className="text-sm text-[var(--muted)]">
          Manually order pairs by strength for each event.
        </p>
      </div>

      <SeedList title="Level doubles seeding" event="level_doubles" rows={initialLevel} />
      <SeedList title="Mixed doubles seeding" event="mixed_doubles" rows={initialMixed} />
    </div>
  );
}
