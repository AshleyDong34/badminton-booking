"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type SessionRow = {
  id: string;
  name: string;
  capacity: number;
  starts_at: string | null;
  ends_at?: string | null;
  notes: string | null;
  signed_up_count: number;
  waitlist_count: number;
};

function dateKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatTimeRange(startIso: string | null, endIso?: string | null) {
  if (!startIso) return "TBC";
  const start = new Date(startIso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!endIso) return start;
  const end = new Date(endIso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${start} to ${end}`;
}

function SessionCard({ session }: { session: SessionRow }) {
  const signedUp = session.signed_up_count ?? 0;
  const waitlist = session.waitlist_count ?? 0;
  const isFull = signedUp >= session.capacity;
  const badgeText = isFull ? "Info & Waitlist" : "Info & Booking";
  const badgeClass = isFull
    ? "bg-[var(--accent)] text-[var(--ink)]"
    : "bg-[var(--ok)] text-white";

  const note = session.notes?.trim() ?? "";
  const noteLabel = note.length > 44 ? `${note.slice(0, 44)}...` : note;

  return (
    <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <div className="text-lg font-semibold text-[var(--ink)]">
          {session.name}
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="h-2 w-2 rounded-full bg-[var(--cool)]" />
          <span>{formatTimeRange(session.starts_at, session.ends_at)}</span>
        </div>
        {noteLabel ? (
          <span className="inline-flex rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs text-[var(--ink)]">
            {noteLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="text-xs text-[var(--muted)]">
          {`${signedUp}/${session.capacity} booked, ${waitlist} waitlist`}
        </div>
        <Link
          href={`/sessions/${session.id}`}
          className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition hover:translate-y-[-1px] ${badgeClass}`}
        >
          {badgeText}
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(true);

  const loadSessions = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      const res = await fetch("/api/public/sessions", { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        console.error("Failed to load sessions:", text);
        if (activeRef.current && mode === "initial") setSessions([]);
      } else {
        const json = await res.json().catch(() => ({}));
        if (activeRef.current)
          setSessions((json.sessions ?? []) as SessionRow[]);
      }
      if (mode === "initial" && activeRef.current) setLoading(false);
      if (mode === "refresh" && activeRef.current) setRefreshing(false);
    },
    []
  );

  useEffect(() => {
    activeRef.current = true;
    loadSessions("initial");

    return () => {
      activeRef.current = false;
    };
  }, [loadSessions]);

  const grouped = useMemo(() => {
    const map = new Map<string, SessionRow[]>();

    for (const s of sessions) {
      if (!s.starts_at) continue;
      const key = dateKey(s.starts_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => ({ key: k, sessions: map.get(k)! }));
  }, [sessions]);

  return (
    <div
      className={`${space.className} min-h-screen bg-[var(--paper)] text-[var(--ink)]`}
      style={
        {
          "--ink": "#14202b",
          "--muted": "#5f6c7b",
          "--paper": "#f6f1e9",
          "--card": "#ffffff",
          "--line": "#e6ddd1",
          "--accent": "#e2b23c",
          "--ok": "#2f9f67",
          "--cool": "#3f8fce",
          "--chip": "#eef5ff",
        } as React.CSSProperties
      }
    >
      <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8">
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#fde9b0] opacity-60 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-16 h-52 w-52 rounded-full bg-[#d9ecff] opacity-70 blur-3xl" />

        <header className="relative mb-10 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Badminton Club
              </p>
              <h1 className="text-3xl font-semibold sm:text-4xl">
                Weekly Sessions
              </h1>
              <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">
                Pick a session to see details and book a spot. If the session is
                full, you can still join the waitlist.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => loadSessions("refresh")}
                disabled={loading || refreshing}
                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <Link
                href="/signin"
                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
              >
                Admin sign in
              </Link>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
            No sessions yet.
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map((group) => {
              const first = group.sessions[0]?.starts_at;
              if (!first) return null;
              return (
                <section key={group.key} className="space-y-4">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-xl font-semibold">{formatDay(first)}</h2>
                    <span className="text-sm text-[var(--muted)]">
                      {formatDate(first)}
                    </span>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
                    {group.sessions.map((session, index) => (
                      <div
                        key={session.id}
                        className={
                          index === 0
                            ? ""
                            : "border-t border-[var(--line)]"
                        }
                      >
                        <SessionCard session={session} />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
