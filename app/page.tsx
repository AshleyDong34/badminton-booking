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

type BulletinContent = {
  club_rules: string;
  useful_info: string;
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

function linkify(text: string) {
  const nodes: React.ReactNode[] = [];
  const regex =
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s]+?)(?=[).,!?]?\s|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const label = match[1] ?? match[3];
    const url = match[2] ?? match[3];
    nodes.push(
      <a
        key={`${url}-${match.index}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--cool)] underline"
      >
        {label}
      </a>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderBulletin(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (list.length === 0) return;
    const items = list.map((item, index) => (
      <li key={`${keyPrefix}-${index}`} className="leading-relaxed">
        {linkify(item)}
      </li>
    ));
    blocks.push(
      <ul key={`${keyPrefix}-list`} className="list-disc space-y-1 pl-5">
        {items}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(`gap-${index}`);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList(`para-${index}`);
    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {linkify(trimmed)}
      </p>
    );
  });

  flushList("tail");

  return blocks.length ? blocks : <p>No bulletin posted yet.</p>;
}

function SessionCard({ session }: { session: SessionRow }) {
  const signedUp = session.signed_up_count ?? 0;
  const waitlist = session.waitlist_count ?? 0;
  const isFull = signedUp >= session.capacity;
  const badgeText = isFull ? "Join waitlist" : "Join signup";
  const badgeClass = isFull
    ? "bg-[var(--wait)] text-[var(--ink)]"
    : "bg-[var(--ok)] text-white";

  const note = session.notes?.trim() ?? "";
  const noteLabel = note.length > 44 ? `${note.slice(0, 44)}...` : note;

  return (
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <div className="text-lg font-semibold text-[var(--ink)]">
          {session.name}
        </div>
        <div className="text-xs text-[var(--muted)] sm:text-sm">
          {formatTimeRange(session.starts_at, session.ends_at)}
        </div>
        {noteLabel ? (
          <span className="inline-flex rounded-full border border-[#dbe8ff] bg-[#eef5ff] px-2.5 py-1 text-xs text-[var(--ink)]">
            {noteLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="text-xs text-[var(--muted)]">
            {`${signedUp}/${session.capacity} booked${
              waitlist > 0 ? ` • ${waitlist} waitlist` : ""
            }`}
          </div>
        <Link
          href={`/sessions/${session.id}`}
          className={`w-full text-center sm:w-auto rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition hover:translate-y-[-1px] ${badgeClass}`}
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
  const [bulletin, setBulletin] = useState<BulletinContent>({
    club_rules: "",
    useful_info: "",
  });
  const [openBulletin, setOpenBulletin] = useState<null | "rules" | "info">(null);

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

  const loadBulletin = useCallback(async () => {
    const res = await fetch("/api/public/bulletin", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    setBulletin({
      club_rules: json.club_rules ?? "",
      useful_info: json.useful_info ?? "",
    });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    loadSessions("initial");
    loadBulletin();

    return () => {
      activeRef.current = false;
    };
  }, [loadSessions, loadBulletin]);

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
          "--paper": "#f4f3ef",
          "--card": "#ffffff",
          "--line": "#e1ddd6",
          "--accent": "#d9734a",
          "--ok": "#2f9f67",
          "--wait": "#f0b49b",
          "--cool": "#2e7d6d",
          "--chip": "#f1efe9",
        } as React.CSSProperties
      }
    >
      <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8">
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#f2c9a8] opacity-45 blur-3xl -z-10" />
        <div className="pointer-events-none absolute right-0 top-16 h-52 w-52 rounded-full bg-[#c7dfd8] opacity-55 blur-3xl -z-10" />

        <header className="relative mb-8 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                EUBC Badminton Club
              </p>
              <h1 className="text-2xl font-semibold sm:text-3xl">
                Weekly Sessions
              </h1>
              <p className="max-w-2xl text-sm text-[var(--muted)] sm:text-base">
                Pick a session to see details and book a spot. If the session is
                full, you can still join the waitlist.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => loadSessions("refresh")}
                disabled={loading || refreshing}
                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <Link
                href="/signin"
                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium shadow-sm sm:px-4 sm:py-2 sm:text-sm"
              >
                Admin sign in
              </Link>
            </div>
          </div>
        </header>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpenBulletin("rules")}
            className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm transition hover:translate-y-[-1px]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white">
              !
            </span>
            Club rules
          </button>
          <button
            type="button"
            onClick={() => setOpenBulletin("info")}
            className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm transition hover:translate-y-[-1px]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cool)] text-white">
              i
            </span>
            Useful info
          </button>
        </div>

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

      {openBulletin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {openBulletin === "rules" ? "Club rules" : "Useful information"}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Updated by the committee.
                </p>
              </div>
              <button
                className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1 text-sm"
                onClick={() => setOpenBulletin(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[#fbfaf7] p-4 text-sm text-[var(--ink)]">
              {openBulletin === "rules"
                ? renderBulletin(bulletin.club_rules)
                : renderBulletin(bulletin.useful_info)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
