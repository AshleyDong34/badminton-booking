"use client";

import { useMemo, useState } from "react";

export type AttendanceSignup = {
  id: string;
  name: string;
  email: string;
  student_id: string | null;
  attended: boolean;
};

type AttendanceClientProps = {
  sessionId: string;
  initialSignups: AttendanceSignup[];
};

export default function AttendanceClient({
  sessionId,
  initialSignups,
}: AttendanceClientProps) {
  const [presentIds, setPresentIds] = useState<string[]>(
    initialSignups.filter((s) => s.attended).map((s) => s.id)
  );
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const presentSet = useMemo(() => new Set(presentIds), [presentIds]);

  const pending = initialSignups.filter((s) => !presentSet.has(s.id));
  const present = initialSignups.filter((s) => presentSet.has(s.id));

  const updateAttendance = async (id: string, attended: boolean) => {
    setError(null);
    setSavingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signupId: id, attended }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to update attendance.");
        return;
      }

      setPresentIds((prev) => {
        if (attended) {
          return prev.includes(id) ? prev : [...prev, id];
        }
        return prev.filter((entry) => entry !== id);
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const markPresent = (id: string) => {
    if (presentSet.has(id)) return;
    updateAttendance(id, true);
  };

  const markAbsent = (id: string) => {
    if (!presentSet.has(id)) return;
    updateAttendance(id, false);
  };

  const markAllPresent = async () => {
    const toMark = pending.map((p) => p.id);
    for (const id of toMark) {
      await updateAttendance(id, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Attendance</h2>
          <p className="text-sm text-[var(--muted)]">
            Checked in: {present.length} | Waiting: {pending.length}
          </p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <button
          type="button"
          onClick={markAllPresent}
          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm"
        >
          Mark all present
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Awaiting check-in</h3>
            <span className="text-xs text-[var(--muted)]">{pending.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {pending.length === 0 ? (
              <li className="p-3 text-sm text-[var(--muted)]">Everyone is checked in.</li>
            ) : (
              pending.map((person) => (
                <li key={person.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{person.name}</div>
                      <div className="text-sm text-[var(--muted)]">{person.email}</div>
                      {person.student_id ? (
                        <div className="text-xs text-[var(--muted)]">
                          Student ID: {person.student_id}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => markPresent(person.id)}
                      disabled={savingIds.has(person.id)}
                      className="rounded-full bg-[var(--ok)] px-3 py-1 text-xs font-semibold text-white shadow-sm"
                    >
                      {savingIds.has(person.id) ? "Saving..." : "Check in"}
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Checked in</h3>
            <span className="text-xs text-[var(--muted)]">{present.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {present.length === 0 ? (
              <li className="p-3 text-sm text-[var(--muted)]">No one checked in yet.</li>
            ) : (
              present.map((person) => (
                <li key={person.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{person.name}</div>
                      <div className="text-sm text-[var(--muted)]">{person.email}</div>
                      {person.student_id ? (
                        <div className="text-xs text-[var(--muted)]">
                          Student ID: {person.student_id}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => markAbsent(person.id)}
                      disabled={savingIds.has(person.id)}
                      className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm"
                    >
                      {savingIds.has(person.id) ? "Saving..." : "Undo"}
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
