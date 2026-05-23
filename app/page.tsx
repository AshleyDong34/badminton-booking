"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
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
  club_rules_label: string;
  club_rules_description: string;
  club_rules: string;
  useful_info_label: string;
  useful_info_description: string;
  useful_info: string;
  court_updates_label: string;
  court_updates_description: string;
  court_updates: string;
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

type BulletinKey = "rules" | "info" | "court";

const COURT_UPDATE_SEEN_STORAGE_KEY = "eubc_court_update_seen";
const COURT_UPDATE_SEEN_EVENT = "eubc:court-update-seen";

function courtUpdateStorageValue(text: string) {
  const normalized = text.trim();
  if (!normalized) return "";

  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `court-update:${normalized.length}:${hash >>> 0}`;
}

function getCourtUpdateSeenSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(COURT_UPDATE_SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeToCourtUpdateSeen(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const listener = () => onStoreChange();
  window.addEventListener("storage", listener);
  window.addEventListener(COURT_UPDATE_SEEN_EVENT, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(COURT_UPDATE_SEEN_EVENT, listener);
  };
}

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

function renderInlineMarkdown(text: string) {
  const nodes: React.ReactNode[] = [];
  const regex =
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|(https?:\/\/[^\s]+?)(?=[).,!?]?\s|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      nodes.push(
        <a
          key={`${match[2]}-${match.index}`}
          href={match[2]}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-[var(--cool)] underline"
        >
          {match[1]}
        </a>
      );
    } else if (match[3] || match[4]) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-bold">
          {match[3] ?? match[4]}
        </strong>
      );
    } else if (match[5] || match[6]) {
      nodes.push(
        <em key={`em-${match.index}`} className="italic">
          {match[5] ?? match[6]}
        </em>
      );
    } else if (match[7]) {
      nodes.push(
        <a
          key={`${match[7]}-${match.index}`}
          href={match[7]}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-[var(--cool)] underline"
        >
          {match[7]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderRichTextBlocks(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let list: { type: "ordered" | "unordered"; item: string }[] = [];

  const flushList = (keyPrefix: string) => {
    if (list.length === 0) return;
    const items = list.map((item, index) => (
      <li key={`${keyPrefix}-${index}`} className="leading-relaxed">
        {renderInlineMarkdown(item.item)}
      </li>
    ));
    const listType = list[0]?.type ?? "unordered";
    if (listType === "ordered") {
      blocks.push(
        <ol key={`${keyPrefix}-list`} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      );
    } else {
      blocks.push(
        <ul key={`${keyPrefix}-list`} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      );
    }
    list = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(`gap-${index}`);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (list.length > 0 && list[0]?.type !== "unordered") {
        flushList(`mixed-${index}`);
      }
      list.push({
        type: "unordered",
        item: trimmed.replace(/^[-*]\s+/, ""),
      });
      return;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      if (list.length > 0 && list[0]?.type !== "ordered") {
        flushList(`mixed-${index}`);
      }
      list.push({
        type: "ordered",
        item: trimmed.replace(/^\d+[.)]\s+/, ""),
      });
      return;
    }
    flushList(`para-${index}`);
    if (/^#{1,3}\s+/.test(trimmed)) {
      const heading = trimmed.replace(/^#{1,3}\s+/, "");
      blocks.push(
        <h4 key={`h-${index}`} className="pt-1 text-base font-bold">
          {renderInlineMarkdown(heading)}
        </h4>
      );
      return;
    }
    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  });

  flushList("tail");

  return blocks;
}

function renderBulletin(text: string) {
  const blocks = renderRichTextBlocks(text);
  return blocks.length ? blocks : <p>No bulletin posted yet.</p>;
}

function renderEventBody(text: string | null) {
  const blocks = renderRichTextBlocks(text ?? "");

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 text-[0.95rem] leading-7 text-[var(--muted)] sm:text-sm sm:leading-6">
      {blocks}
    </div>
  );
}

function SessionCard({ session }: { session: SessionRow }) {
  const signedUp = session.signed_up_count ?? 0;
  const waitlist = session.waitlist_count ?? 0;
  const isFull = signedUp >= session.capacity;
  const badgeText = isFull ? "Join waitlist" : "Join signup";
  const badgeClass = isFull
    ? "bg-[#f3c0a2] text-[#321a11]"
    : "bg-[var(--ok)] text-white";
  const progress =
    session.capacity > 0
      ? Math.min(100, Math.round((signedUp / session.capacity) * 100))
      : 0;

  const note = session.notes?.trim() ?? "";
  const noteLabel = note.length > 44 ? `${note.slice(0, 44)}...` : note;
  const startTime = session.starts_at
    ? new Date(session.starts_at).toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const endTime = session.ends_at
    ? new Date(session.ends_at).toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/80 bg-white p-4 shadow-[0_10px_28px_rgba(15,26,18,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,26,18,0.11)] sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#b7d7c2] opacity-20" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--cool)]">
              {startTime && endTime ? `${startTime}-${endTime}` : "Session"}
            </span>
            {noteLabel ? (
              <span className="rounded-full border border-[#ecd8aa] bg-[#fff4d6] px-3 py-1 text-xs font-medium text-[#6a4b11]">
                {noteLabel}
              </span>
            ) : null}
          </div>
          <div>
            <h3 className="text-xl font-semibold leading-tight text-[var(--ink)]">
              {session.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isFull
                ? "This one is full, but the waitlist is open."
                : "Spaces are available for this session."}
            </p>
          </div>
        </div>

        <div className="flex min-w-[11rem] flex-col gap-3 sm:items-end">
          <div className="w-full space-y-2 sm:w-44">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
              <span>{signedUp}/{session.capacity} booked</span>
              {waitlist > 0 && <span>{waitlist} waitlist</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#dde8df]">
              <div
                className={`h-full rounded-full ${
                  isFull ? "bg-[#d66c45]" : "bg-[var(--ok)]"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Link
            href={`/sessions/${session.id}`}
            className={`w-full rounded-xl px-5 py-3 text-center text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 sm:w-auto ${badgeClass}`}
          >
            {badgeText}
          </Link>
        </div>
      </div>
    </article>
  );
}

function EventImagePanel({
  event,
  className,
  imageClassName = "rounded-xl",
}: {
  event: EventRow;
  className: string;
  imageClassName?: string;
}) {
  if (!event.image_url) return null;

  return (
    <div className={`relative overflow-hidden bg-[#dfe8e8] ${className}`}>
      <img
        src={event.image_url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/55 via-white/30 to-[#dce8ef]/45" />
      <div className="absolute inset-2 z-10 flex items-center justify-center sm:inset-3">
        <img
          src={event.image_url}
          alt={event.image_alt || ""}
          className={`h-auto max-h-full w-auto max-w-full object-contain shadow-sm ${imageClassName}`}
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
    <section id="events" className="relative mb-12 scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--cool)]">
            Events
          </p>
          <h2 className={`${sora.className} mt-1 text-2xl font-bold text-[var(--ink)]`}>
            What is happening next
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-6 text-[var(--muted)]">
          Event cards and special announcements from the committee.
        </p>
      </div>

      <div className="relative px-0 pt-5 sm:px-12">
        {hasMultipleEvents && (
          <>
            <div className="absolute left-10 right-10 top-0 h-16 rounded-t-xl border border-b-0 border-white/70 bg-white/45 shadow-sm sm:left-24 sm:right-24" />
            <div className="absolute left-5 right-5 top-2 h-16 rounded-t-xl border border-b-0 border-white/70 bg-white/70 shadow-sm sm:left-16 sm:right-16" />
          </>
        )}

        <article className="relative overflow-hidden rounded-2xl border border-white/80 bg-[#fbfaf2] shadow-[0_25px_70px_rgba(20,42,30,0.15)]">
          <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#c9e4cc] opacity-50 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-44 w-44 rounded-full bg-[#d7e6ff] opacity-60 blur-3xl" />
          <div
            className={`relative grid h-[30rem] md:h-[22rem] ${
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
              className="flex min-h-0 cursor-pointer flex-col gap-4 overflow-hidden p-5 text-left sm:p-7"
              aria-label={`Open ${activeEvent.title}`}
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
                <h2 className={`${sora.className} text-2xl font-bold leading-tight text-[var(--ink)] sm:text-3xl`}>
                  {activeEvent.title}
                </h2>
                <div className="max-h-48 overflow-y-auto pr-1 md:max-h-44">
                  {body}
                </div>
              </div>

              {hasLink && (
                <div className="shrink-0 pt-1">
                  <a
                    href={activeEvent.link_url!}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--cool)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 sm:text-sm"
                  >
                    {activeEvent.link_label}
                    <span aria-hidden="true">-&gt;</span>
                  </a>
                </div>
              )}
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
              className="absolute left-1 top-[calc(50%-1.5rem)] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-white/80 bg-white/95 text-3xl font-semibold leading-none text-[var(--cool)] shadow-xl ring-4 ring-[var(--paper)] transition hover:scale-105 hover:bg-[#f3f8f4] sm:flex"
              aria-label="Previous event"
            >
              &#8249;
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-1 top-[calc(50%-1.5rem)] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-white/80 bg-white/95 text-3xl font-semibold leading-none text-[var(--cool)] shadow-xl ring-4 ring-[var(--paper)] transition hover:scale-105 hover:bg-[#f3f8f4] sm:flex"
              aria-label="Next event"
            >
              &#8250;
            </button>

            <div className="relative z-10 mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={goPrevious}
                className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/80 bg-white px-3 text-xl font-semibold text-[var(--cool)] shadow-md sm:hidden"
                aria-label="Previous event"
              >
                &#8249;
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-white/80 bg-white px-3 py-2 shadow-lg">
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
                className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/80 bg-white px-3 text-xl font-semibold text-[var(--cool)] shadow-md sm:hidden"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenEventIndex(null)}
        >
          <div
            className={`relative grid max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-[var(--card)] shadow-2xl ${
              openEvent.image_url
                ? "grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)] md:grid-rows-1"
                : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenEventIndex(null)}
              className="absolute right-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-white/80 bg-white/95 text-2xl font-bold leading-none text-[var(--ink)] shadow-lg transition hover:scale-105 hover:bg-white"
              aria-label="Close event"
            >
              <span aria-hidden="true">&times;</span>
            </button>

            {openEvent.image_url && (
              <EventImagePanel
                event={openEvent}
                className="min-h-0 h-[54vh] max-h-[58vh] md:h-[92vh] md:max-h-none"
                imageClassName="rounded-xl"
              />
            )}
            {hasMultipleEvents && (
              <>
                <button
                  type="button"
                  onClick={goModalPrevious}
                  className="absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-white/50 bg-white/90 text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg transition hover:scale-105 md:flex"
                  aria-label="Previous event"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  onClick={goModalNext}
                  className="absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-white/50 bg-white/90 text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg transition hover:scale-105 md:flex"
                  aria-label="Next event"
                >
                  &#8250;
                </button>
              </>
            )}

            <div
              className={`flex min-h-0 flex-col gap-3 overflow-hidden p-4 pt-5 sm:p-5 sm:pt-6 md:max-h-[92vh] md:p-7 ${
                openEvent.image_url ? "max-h-[42vh]" : "max-h-[82vh]"
              }`}
            >
              <div className="min-w-0 pr-12">
                <h2 className="text-xl font-semibold leading-tight text-[var(--ink)] sm:text-2xl">
                  {openEvent.title}
                </h2>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {renderEventBody(openEvent.body)}
              </div>

              {openEvent.link_label && openEvent.link_url && (
                <a
                  href={openEvent.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-[var(--cool)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm sm:text-sm"
                >
                  {openEvent.link_label}
                  <span aria-hidden="true">-&gt;</span>
                </a>
              )}

              {hasMultipleEvents && (
                <div className="mt-auto grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--chip)] p-2">
                  <button
                    type="button"
                    onClick={goModalPrevious}
                    className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm"
                  >
                    <span className="hidden sm:inline">&#8249; Previous</span>
                    <span className="sm:hidden">&#8249;</span>
                  </button>
                  <span className="whitespace-nowrap text-xs font-semibold text-[var(--muted)]">
                    Event {(openEventIndex ?? 0) + 1} of {events.length}
                  </span>
                  <button
                    type="button"
                    onClick={goModalNext}
                    className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm"
                  >
                    <span className="hidden sm:inline">Next &#8250;</span>
                    <span className="sm:hidden">&#8250;</span>
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
  const sessionRequestRef = useRef(0);
  const [bulletin, setBulletin] = useState<BulletinContent>({
    club_rules_label: "Club Rules",
    club_rules_description: "Court Rules and Player Attitude",
    club_rules: "",
    useful_info_label: "Useful info",
    useful_info_description: "Links for EUBC",
    useful_info: "",
    court_updates_label: "Court updates",
    court_updates_description: "No sudden updates",
    court_updates: "",
  });
  const [openBulletin, setOpenBulletin] = useState<null | BulletinKey>(null);
  const seenCourtUpdateKey = useSyncExternalStore(
    subscribeToCourtUpdateSeen,
    getCourtUpdateSeenSnapshot,
    () => null
  );
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    club_champs_public_enabled: false,
    sessions_public_enabled: true,
  });

  const loadSessions = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      const requestId = sessionRequestRef.current + 1;
      sessionRequestRef.current = requestId;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      const res = await fetch("/api/public/sessions", { cache: "no-store" });
      const isCurrentRequest =
        activeRef.current && requestId === sessionRequestRef.current;

      if (!res.ok) {
        const text = await res.text();
        console.error("Failed to load sessions:", text);
        if (isCurrentRequest && mode === "initial") setSessions([]);
      } else {
        const json = await res.json().catch(() => ({}));
        if (isCurrentRequest) {
          setSessions((json.sessions ?? []) as SessionRow[]);
          if (typeof json.hidden === "boolean") {
            setPublicSettings((prev) => ({
              ...prev,
              sessions_public_enabled: !json.hidden,
            }));
          }
        }
      }
      if (mode === "initial" && isCurrentRequest) setLoading(false);
      if (mode === "refresh" && isCurrentRequest) setRefreshing(false);
    },
    []
  );

  const loadBulletin = useCallback(async () => {
    const res = await fetch("/api/public/bulletin", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json().catch(() => ({}));
    setBulletin({
      club_rules_label: json.club_rules_label ?? "Club Rules",
      club_rules_description:
        json.club_rules_description ?? "Court Rules and Player Attitude",
      club_rules: json.club_rules ?? "",
      useful_info_label: json.useful_info_label ?? "Useful info",
      useful_info_description: json.useful_info_description ?? "Links for EUBC",
      useful_info: json.useful_info ?? "",
      court_updates_label: json.court_updates_label ?? "Court updates",
      court_updates_description:
        json.court_updates_description ?? "No sudden updates",
      court_updates: json.court_updates ?? "",
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

  const courtUpdateText = bulletin.court_updates.trim();
  const courtUpdateKey = useMemo(
    () => courtUpdateStorageValue(courtUpdateText),
    [courtUpdateText]
  );
  const hasCourtUpdate = courtUpdateText.length > 0;
  const isCourtUpdateUrgent =
    hasCourtUpdate && seenCourtUpdateKey !== courtUpdateKey;
  const rawCourtUpdateDescription = bulletin.court_updates_description.trim();
  const hasCustomCourtUpdateDescription =
    rawCourtUpdateDescription.length > 0 &&
    rawCourtUpdateDescription.toLowerCase() !== "no sudden updates";
  const courtUpdateDescription = hasCourtUpdate
    ? hasCustomCourtUpdateDescription
      ? rawCourtUpdateDescription
      : "Last-minute update posted"
    : "No sudden updates";

  const openCourtUpdates = useCallback(() => {
    if (courtUpdateKey) {
      try {
        window.localStorage.setItem(
          COURT_UPDATE_SEEN_STORAGE_KEY,
          courtUpdateKey
        );
        window.dispatchEvent(new Event(COURT_UPDATE_SEEN_EVENT));
      } catch {
        // Some browsers can block localStorage; the modal should still open.
      }
    }
    setOpenBulletin("court");
  }, [courtUpdateKey]);

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

  const openBulletinTitle =
    openBulletin === "rules"
      ? bulletin.club_rules_label
      : openBulletin === "info"
        ? bulletin.useful_info_label
        : bulletin.court_updates_label;
  const openBulletinBody =
    openBulletin === "rules"
      ? bulletin.club_rules
      : openBulletin === "info"
        ? bulletin.useful_info
        : courtUpdateText || "No sudden updates right now.";

  return (
    <div
      className={`${space.className} min-h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]`}
      style={
        {
          "--ink": "#101913",
          "--muted": "#475850",
          "--paper": "#edf3ee",
          "--card": "#ffffff",
          "--line": "#cfddd4",
          "--accent": "#dc6742",
          "--ok": "#1d8b5b",
          "--wait": "#f3c0a2",
          "--cool": "#214f73",
          "--chip": "#edf6f0",
        } as React.CSSProperties
      }
    >
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(176,215,183,0.75),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(180,205,235,0.62),transparent_30%),linear-gradient(135deg,#edf3ee_0%,#f7f0df_48%,#e8f1ec_100%)]" />
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/50" />
        <div className="absolute left-[8%] top-0 h-full w-px bg-white/35" />
        <div className="absolute right-[8%] top-0 h-full w-px bg-white/35" />
        <div className="absolute inset-x-0 top-52 h-px bg-white/45" />
        <div className="absolute inset-x-0 bottom-40 h-px bg-white/35" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-6 sm:px-8 lg:px-10">
        <nav className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-white/80 bg-white shadow-lg">
              <Image
                src="/icon.png"
                alt="EUBC logo"
                fill
                sizes="48px"
                className="object-cover"
                priority
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--cool)]">
                EUBC
              </p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                Badminton Club
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadSessions("refresh")}
              disabled={loading || refreshing}
              className="rounded-xl border border-white/80 bg-white/75 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              href="/signin"
              className="rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
            >
              Admin sign in
            </Link>
          </div>
        </nav>

        <header className="relative mb-8 overflow-hidden rounded-2xl border border-white/75 bg-white/72 p-6 shadow-[0_18px_55px_rgba(18,42,28,0.12)] backdrop-blur-xl sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#9dc7f2] opacity-40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-16 h-72 w-72 rounded-full bg-[#f2c16d] opacity-35 blur-3xl" />
          <div className="relative max-w-3xl space-y-4">
              <h1
                className={`${sora.className} text-4xl font-bold leading-[0.98] tracking-[-0.045em] text-[var(--ink)] sm:text-5xl lg:text-6xl`}
              >
                EUBC Badminton Club
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Book weekly sessions and check club notices. If a session is
                full, join the waitlist and you will be promoted and notified
                automatically when a space opens.
              </p>
          </div>
        </header>

        <section id="noticeboard" className="mb-10 scroll-mt-6">
          <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--cool)]">
                Noticeboard
              </p>
              <h2 className={`${sora.className} mt-1 text-2xl font-bold text-[var(--ink)]`}>
                Club information
              </h2>
            </div>
            <p className="text-sm leading-6 text-[var(--muted)] md:text-right">
              Check these before booking. Last-minute court updates will appear
              here when needed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setOpenBulletin("rules")}
              className="group flex min-h-14 items-center gap-3 rounded-xl border border-white/80 bg-white/85 px-4 py-2.5 text-left shadow-md backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-base font-bold text-white shadow-sm">
                !
              </span>
              <span>
                <span className="block text-sm font-bold">
                  {bulletin.club_rules_label}
                </span>
                <span className="block text-[13px] leading-5 text-[var(--muted)]">
                  {bulletin.club_rules_description}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpenBulletin("info")}
              className="group flex min-h-14 items-center gap-3 rounded-xl border border-white/80 bg-white/85 px-4 py-2.5 text-left shadow-md backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cool)] text-base font-bold text-white shadow-sm">
                i
              </span>
              <span>
                <span className="block text-sm font-bold">
                  {bulletin.useful_info_label}
                </span>
                <span className="block text-[13px] leading-5 text-[var(--muted)]">
                  {bulletin.useful_info_description}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={openCourtUpdates}
              className={`group relative flex min-h-14 items-center gap-3 rounded-xl px-4 py-2.5 text-left backdrop-blur transition hover:-translate-y-0.5 hover:bg-white ${
                isCourtUpdateUrgent
                  ? "court-update-alert border border-[#e3a33e]/70 bg-[#fff2cb] shadow-[0_14px_32px_rgba(214,108,69,0.22)] ring-2 ring-[#f0be65]/35"
                  : "border border-white/80 bg-white/85 shadow-md"
              }`}
            >
              {isCourtUpdateUrgent && (
                <span className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_rgba(220,103,66,0.16)]" />
              )}
              <span
                 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-sm ${
                  isCourtUpdateUrgent ? "bg-[var(--accent)]" : "bg-[var(--ok)]"
                }`}
              >
                *
              </span>
              <span>
                <span className="block text-sm font-bold">
                  {bulletin.court_updates_label}
                </span>
                <span className="block text-[13px] leading-5 text-[var(--muted)]">
                  {courtUpdateDescription}
                </span>
              </span>
            </button>
          </div>
        </section>

        <EventsBanner events={events} />

        {publicSettings.club_champs_public_enabled && (
          <section className="relative mb-12 overflow-hidden rounded-2xl border border-[#c5dfcc] bg-[linear-gradient(135deg,#e8f6eb_0%,#c5e5cd_48%,#93cba6_100%)] p-6 text-[#0b2719] shadow-[0_18px_50px_rgba(37,86,56,0.16)] sm:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(255,255,255,0.48),transparent_30%),radial-gradient(circle_at_92%_8%,rgba(255,255,255,0.28),transparent_26%)]" />
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#315b43]">
                  Tournament mode
                </p>
                <h2 className={`${sora.className} mt-2 text-3xl font-bold`}>
                  Club champs live hub
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#315b43]">
                  Follow tournament progress, results, and updates from the committee.
                </p>
              </div>
              <Link
                href="/club-champs"
                className="relative rounded-xl border border-[#6ea981]/40 bg-white/85 px-5 py-3 text-sm font-bold text-[#0b3a25] shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
              >
                Open Club champs
              </Link>
            </div>
          </section>
        )}

        <section id="sessions" className="scroll-mt-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--cool)]">
                Booking board
              </p>
              <h2 className={`${sora.className} mt-1 text-3xl font-bold text-[var(--ink)]`}>
                Weekly sessions
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/80 bg-white p-8 shadow-sm">
              Loading sessions...
            </div>
          ) : !publicSettings.sessions_public_enabled ? (
            <div className="rounded-2xl border border-white/80 bg-white p-8 shadow-sm">
              Session booking is currently hidden by the committee.
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-white/80 bg-white p-8 shadow-sm">
              No sessions yet.
            </div>
          ) : (
            <div className="space-y-10">
              {grouped.map((group) => {
                const first = group.sessions[0]?.starts_at;
                if (!first) return null;
                return (
                  <section key={group.key} className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-[var(--cool)] px-4 py-2 text-sm font-bold text-white shadow-sm">
                        {formatDay(first)}
                      </span>
                      <span className="text-sm font-semibold text-[var(--muted)]">
                        {formatDate(first)}
                      </span>
                    </div>

                    <div className="grid gap-3">
                      {group.sessions.map((session) => (
                        <SessionCard key={session.id} session={session} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {openBulletin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenBulletin(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_30px_90px_rgba(0,0,0,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--cool)]">
                  Committee note
                </p>
                <h3 className={`${sora.className} mt-2 text-2xl font-bold`}>
                  {openBulletinTitle}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Updated by the committee.
                </p>
              </div>
              <button
                className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-2 text-sm font-semibold transition hover:bg-white"
                onClick={() => setOpenBulletin(null)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 max-h-[60vh] space-y-3 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--chip)] p-5 text-sm leading-6 text-[var(--ink)]">
              {renderBulletin(openBulletinBody)}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
