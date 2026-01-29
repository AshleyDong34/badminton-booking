"use client";

import { useEffect, useMemo, useState } from "react";

export type AttendanceSignup = {
  id: string;
  name: string;
  email: string;
};

type AttendanceClientProps = {
  sessionId: string;
  initialSignups: AttendanceSignup[];
};

const storageKey = (sessionId: string) => `attendance:${sessionId}`;

export default function AttendanceClient({
  sessionId,
  initialSignups,
}: AttendanceClientProps) {
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const allIds = useMemo(() => new Set(initialSignups.map((s) => s.id)), [initialSignups]);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          setPresentIds(parsed.filter((id) => allIds.has(id)));
        }
      } catch {
        setPresentIds([]);
      }
    }
    setLoaded(true);
  }, [sessionId, allIds]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(presentIds));
  }, [presentIds, loaded, sessionId]);

  const presentSet = useMemo(() => new Set(presentIds), [presentIds]);

  const pending = initialSignups.filter((s) => !presentSet.has(s.id));
  const present = initialSignups.filter((s) => presentSet.has(s.id));

  const markPresent = (id: string) => {
    if (presentSet.has(id)) return;
    setPresentIds((prev) => [...prev, id]);
  };

  const markAbsent = (id: string) => {
    if (!presentSet.has(id)) return;
    setPresentIds((prev) => prev.filter((entry) => entry !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Attendance</h2>
          <p className="text-sm text-[var(--muted)]">
            Checked in: {present.length} | Waiting: {pending.length}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPresentIds(initialSignups.map((s) => s.id))}
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
                    </div>
                    <button
                      type="button"
                      onClick={() => markPresent(person.id)}
                      className="rounded-full bg-[var(--ok)] px-3 py-1 text-xs font-semibold text-white shadow-sm"
                    >
                      Check in
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
                    </div>
                    <button
                      type="button"
                      onClick={() => markAbsent(person.id)}
                      className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm"
                    >
                      Undo
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
