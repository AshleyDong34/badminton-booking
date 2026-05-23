"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Space_Grotesk, Sora } from "next/font/google";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
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

type EventRow = {
  id: string;
  title: string;
  body: string | null;
  link_label: string | null;
  link_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_side: "left" | "right" | null;
  sort_order: number | null;
};

type PublicSettings = {
  club_champs_public_enabled: boolean;
  sessions_public_enabled: boolean;
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

function renderEventBody(text: string | null) {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div className="space-y-2 text-sm leading-relaxed text-[var(--muted)]">
      {lines.map((line, index) => (
        <p key={`${line}-${index}`}>{linkify(line)}</p>
      ))}
    </div>
  );
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
        {noteLabel ? (
          <span className="inline-flex rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs text-[var(--ink)]">
            {noteLabel}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="text-xs text-[var(--muted)]">
            {`${signedUp}/${session.capacity} booked${
              waitlist > 0 ? ` | ${waitlist} waitlist` : ""
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

function EventImagePanel({
  event,
  className,
}: {
  event: EventRow;
  className: string;
}) {
  if (!event.image_url) return null;

  return (
    <div className={`relative overflow-hidden bg-[#dfe8e8] ${className}`}>
      <img
        src={event.image_url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-lg"
      />
      <div className="absolute inset-0 bg-white/40" />
      <div className="absolute inset-2 z-10 flex items-center justify-center sm:inset-3">
        <img
          src={event.image_url}
          alt={event.image_alt || ""}
          className="max-h-full max-w-full rounded-2xl object-contain shadow-sm"
        />
      </div>
    </div>
  );
}

function EventsBanner({ events }: { events: EventRow[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [openEventIndex, setOpenEventIndex] = useState<number | null>(null);

  if (events.length === 0) return null;

  const activeEvent = events[activeIndex] ?? events[0];
  const body = renderEventBody(activeEvent.body);
  const hasLink = activeEvent.link_label && activeEvent.link_url;
  const hasImage = Boolean(activeEvent.image_url);
  const imageFirst = hasImage && activeEvent.image_side === "left";
  const hasMultipleEvents = events.length > 1;
  const openEvent =
    openEventIndex === null ? null : events[openEventIndex] ?? null;

  const goPrevious = () => {
    setActiveIndex((current) => (current === 0 ? events.length - 1 : current - 1));
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % events.length);
  };

  const openEventAt = (index: number) => {
    setActiveIndex(index);
    setOpenEventIndex(index);
  };

  const goModalPrevious = () => {
    const current = openEventIndex ?? activeIndex;
    const next = current === 0 ? events.length - 1 : current - 1;
    setActiveIndex(next);
    setOpenEventIndex(next);
  };

  const goModalNext = () => {
    const current = openEventIndex ?? activeIndex;
    const next = (current + 1) % events.length;
    setActiveIndex(next);
    setOpenEventIndex(next);
  };

  return (
    <section className="mb-8">
      <div className="relative px-0 pt-4 sm:px-10">
        {hasMultipleEvents && (
          <>
            <div className="absolute left-10 right-10 top-0 h-[calc(100%-3.25rem)] rounded-3xl border border-[var(--line)] bg-[var(--card)] opacity-45 shadow-sm sm:left-20 sm:right-20" />
            <div className="absolute left-5 right-5 top-2 h-[calc(100%-3.25rem)] rounded-3xl border border-[var(--line)] bg-[var(--card)] opacity-75 shadow-sm sm:left-14 sm:right-14" />
          </>
        )}

        <article className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)] shadow-md">
          <div
            className={`grid h-[28rem] md:h-[20rem] ${
              hasImage ? "md:grid-cols-[minmax(0,1fr)_minmax(280px,0.88fr)]" : ""
            }`}
          >
            {hasImage && imageFirst && (
              <button
                type="button"
                onClick={() => openEventAt(activeIndex)}
                className="block h-44 w-full overflow-hidden border-0 bg-transparent p-0 text-left leading-none md:order-first md:h-full"
                aria-label={`Open ${activeEvent.title}`}
              >
                <EventImagePanel event={activeEvent} className="h-full" />
              </button>
            )}

            <div
              role="button"
              tabIndex={0}
              onClick={() => openEventAt(activeIndex)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEventAt(activeIndex);
                }
              }}
              className="flex min-h-0 cursor-pointer flex-col justify-between gap-5 overflow-hidden p-6 text-left sm:p-8"
              aria-label={`Open ${activeEvent.title}`}
            >
              <div className="min-h-0 space-y-3 overflow-hidden">
                <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">
                  Event
                </div>
                <h2 className="text-2xl font-semibold leading-tight text-[var(--ink)]">
                  {activeEvent.title}
                </h2>
                <div className="max-h-36 overflow-y-auto pr-1 md:max-h-28">
                  {body}
                </div>
              </div>

              <div className="flex items-center">
                {hasLink ? (
                  <a
                    href={activeEvent.link_url!}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px]"
                  >
                    {activeEvent.link_label}
                    <span aria-hidden="true">-&gt;</span>
                  </a>
                ) : (
                  <span />
                )}
              </div>
            </div>

            {hasImage && !imageFirst && (
              <button
                type="button"
                onClick={() => openEventAt(activeIndex)}
                className="block h-44 w-full overflow-hidden border-0 bg-transparent p-0 text-left leading-none md:h-full"
                aria-label={`Open ${activeEvent.title}`}
              >
                <EventImagePanel event={activeEvent} className="h-full" />
              </button>
            )}
          </div>
        </article>

        {hasMultipleEvents && (
          <>
            <button
              type="button"
              onClick={goPrevious}
              className="absolute left-1 top-[calc(50%-1.5rem)] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line)] bg-white/95 text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg ring-4 ring-[var(--paper)] transition hover:scale-105 hover:bg-[var(--chip)] sm:flex"
              aria-label="Previous event"
            >
              &#8249;
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-1 top-[calc(50%-1.5rem)] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--line)] bg-white/95 text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg ring-4 ring-[var(--paper)] transition hover:scale-105 hover:bg-[var(--chip)] sm:flex"
              aria-label="Next event"
            >
              &#8250;
            </button>

            <div className="relative z-10 mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={goPrevious}
                className="flex h-10 min-w-10 items-center justify-center rounded-full border border-[var(--line)] bg-white px-3 text-xl font-semibold text-[var(--cool)] shadow-sm sm:hidden"
                aria-label="Previous event"
              >
                &#8249;
              </button>
              <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-2 shadow-md">
                <span className="mr-1 hidden text-xs font-semibold text-[var(--muted)] sm:inline">
                  Event {activeIndex + 1} of {events.length}
                </span>
                <span className="mr-1 text-xs font-semibold text-[var(--muted)] sm:hidden">
                  {activeIndex + 1}/{events.length}
                </span>
                {events.map((event, index) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Show event ${index + 1}`}
                    aria-current={index === activeIndex ? "true" : undefined}
                    className={`h-2.5 rounded-full transition-all ${
                      index === activeIndex
                        ? "w-8 bg-[var(--cool)]"
                        : "w-2.5 bg-[var(--line)]"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={goNext}
                className="flex h-10 min-w-10 items-center justify-center rounded-full border border-[var(--line)] bg-white px-3 text-xl font-semibold text-[var(--cool)] shadow-sm sm:hidden"
                aria-label="Next event"
              >
                &#8250;
              </button>
            </div>
          </>
        )}
      </div>

      {openEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenEventIndex(null)}
        >
          <div
            className={`relative grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] bg-[var(--card)] shadow-2xl ${
              openEvent.image_url
                ? "md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.8fr)]"
                : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            {openEvent.image_url && (
              <EventImagePanel
                event={openEvent}
                className="h-[58vh] min-h-80 md:h-[92vh]"
              />
            )}
            {hasMultipleEvents && (
              <>
                <button
                  type="button"
                  onClick={goModalPrevious}
                  className="absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/90 text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg transition hover:scale-105 md:flex"
                  aria-label="Previous event"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  onClick={goModalNext}
                  className="absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/90 text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg transition hover:scale-105 md:flex"
                  aria-label="Next event"
                >
                  &#8250;
                </button>
              </>
            )}

            <div className="flex max-h-[34vh] flex-col gap-4 overflow-y-auto p-5 md:max-h-[92vh] md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cool)]">
                    Event
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold leading-tight text-[var(--ink)]">
                    {openEvent.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenEventIndex(null)}
                  className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1 text-sm font-semibold"
                >
                  Close
                </button>
              </div>

              {renderEventBody(openEvent.body)}

              {openEvent.link_label && openEvent.link_url && (
                <a
                  href={openEvent.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  {openEvent.link_label}
                  <span aria-hidden="true">-&gt;</span>
                </a>
              )}

              {hasMultipleEvents && (
                <div className="mt-auto flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--chip)] p-2">
                  <button
                    type="button"
                    onClick={goModalPrevious}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm"
                  >
                    &#8249; Previous
                  </button>
                  <span className="text-xs font-semibold text-[var(--muted)]">
                    Event {(openEventIndex ?? 0) + 1} of {events.length}
                  </span>
                  <button
                    type="button"
                    onClick={goModalNext}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm"
                  >
                    Next &#8250;
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(true);
  const [bulletin, setBulletin] = useState<BulletinContent>({
    club_rules: "",
    useful_info: "",
  });
  const [openBulletin, setOpenBulletin] = useState<null | "rules" | "info">(null);
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    club_champs_public_enabled: false,
    sessions_public_enabled: true,
  });

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
        if (activeRef.current) {
          setSessions((json.sessions ?? []) as SessionRow[]);
          if (typeof json.hidden === "boolean") {
            setPublicSettings((prev) => ({
              ...prev,
              sessions_public_enabled: !json.hidden,
            }));
          }
        }
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

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/public/events", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    setEvents((json.events ?? []) as EventRow[]);
  }, []);

  const loadPublicSettings = useCallback(async () => {
    const res = await fetch("/api/public/settings", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    setPublicSettings({
      club_champs_public_enabled: Boolean(json.club_champs_public_enabled),
      sessions_public_enabled: json.sessions_public_enabled ?? true,
    });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const run = async () => {
      await loadSessions("initial");
      await loadBulletin();
      await loadEvents();
      await loadPublicSettings();
    };
    void run();

    return () => {
      activeRef.current = false;
    };
  }, [loadSessions, loadBulletin, loadEvents, loadPublicSettings]);

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
          "--ink": "#0f1a12",
          "--muted": "#56626f",
          "--paper": "#eef2f2",
          "--card": "#ffffff",
          "--line": "#cedbd3",
          "--accent": "#d4573e",
          "--ok": "#1f8d5b",
          "--wait": "#e8a6ad",
          "--cool": "#1f4f85",
          "--chip": "#eaf1f4",
        } as React.CSSProperties
      }
    >
      <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8">
        <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-[#a9cfb0] opacity-45 blur-3xl -z-10" />
        <div className="pointer-events-none absolute right-0 top-16 h-56 w-56 rounded-full bg-[#b9d0eb] opacity-40 blur-3xl -z-10" />
        <div className="pointer-events-none absolute right-28 top-0 h-40 w-40 rounded-full bg-[#f0c38f] opacity-35 blur-3xl -z-10" />

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)]/90 p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#c8ddf3] opacity-45 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-[#c4dfc8] opacity-45 blur-2xl" />
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className={`${sora.className} text-xs font-semibold uppercase tracking-[0.34em] text-[var(--cool)]`}>
                EUBC Badminton Club
              </p>
              <h1
                className={`${sora.className} bg-gradient-to-r from-[#103656] via-[#164f84] to-[#1f7c5b] bg-clip-text text-3xl font-bold leading-tight text-transparent sm:text-4xl`}
              >
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
            Club Rules
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

        <EventsBanner events={events} />

        {publicSettings.club_champs_public_enabled && (
          <section className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Club champs</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Follow tournament progress, results, and updates from the committee.
                </p>
              </div>
              <Link
                href="/club-champs"
                className="rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px]"
              >
                Open Club champs
              </Link>
            </div>
          </section>
        )}

        {loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
            Loading sessions...
          </div>
        ) : !publicSettings.sessions_public_enabled ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6">
            Session booking is currently hidden by the committee.
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
                  {openBulletin === "rules" ? "Club Champ rules" : "Useful information"}
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
            <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--chip)] p-4 text-sm text-[var(--ink)]">
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
