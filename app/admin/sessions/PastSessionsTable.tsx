"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DeleteSessionButton from "./DeleteSessionButton";

type Row = {
  id: string;
  name: string;
  capacity: number;
  signed_up_count: number;
  waiting_list_count: number;
  starts_at: string | null;
  ends_at: string | null;
};

export default function PastSessionsTable({ sessions }: { sessions: Row[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allIds = useMemo(() => sessions.map((s) => s.id), [sessions]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  };

  const exportSelected = async () => {
    if (selected.size === 0) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sessions/export-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionIds: Array.from(selected) }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to export attendance.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `attendance-export-${stamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[var(--muted)]">
          {selected.size} selected
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm"
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
          <button
            type="button"
            onClick={exportSelected}
            disabled={selected.size === 0 || exporting}
            className="rounded-full bg-[var(--ok)] px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? "Exporting..." : "Export attendance"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-[var(--line)]">
            <tr className="text-left text-[var(--muted)]">
              <th className="py-3 px-4">Select</th>
              <th className="py-3 px-4">Session</th>
              <th className="py-3 px-4">Capacity</th>
              <th className="py-3 px-4">Signed up</th>
              <th className="py-3 px-4">Waiting list</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, idx) => {
              const isFull = s.signed_up_count >= s.capacity;
              const end = s.ends_at ?? s.starts_at;
              const isPast = end ? new Date(end) < new Date() : false;
              const statusClass = isPast
                ? "bg-[var(--line)] text-[var(--muted)]"
                : isFull
                ? "bg-[var(--accent)] text-[var(--ink)]"
                : "bg-[var(--ok)] text-white";

              const statusLabel = isPast ? "ENDED" : isFull ? "FULL" : "OPEN";

              return (
                <tr
                  key={s.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
                >
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                    />
                  </td>
                  <td className="py-3 px-4 font-medium">{s.name}</td>
                  <td className="py-3 px-4">{s.capacity}</td>
                  <td className="py-3 px-4">
                    {s.signed_up_count}/{s.capacity}
                  </td>
                  <td className="py-3 px-4">{s.waiting_list_count}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="py-3 px-4 space-x-2">
                    <Link
                      className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm transition hover:translate-y-[-1px]"
                      href={`/admin/sessions/${s.id}`}
                    >
                      Manage
                    </Link>
                    <Link
                      className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm transition hover:translate-y-[-1px]"
                      href={`/admin/sessions/${s.id}/attendance`}
                    >
                      Attendance
                    </Link>
                    <DeleteSessionButton id={s.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sessions.length === 0 && (
          <p className="px-4 py-6 text-sm text-[var(--muted)]">
            No past sessions yet.
          </p>
        )}
      </div>
    </div>
  );
}
