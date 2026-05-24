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

function renderNoticeboardBody(text: string) {
  const blocks = renderRichTextBlocks(text);
  return blocks.length ? blocks : <p>No notice posted yet.</p>;
}

function renderEventBody(text: string | null) {
  const blocks = renderRichTextBlocks(text ?? "");

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2 text-[0.92rem] leading-6 text-[var(--muted)] sm:text-sm">
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
    ? "bg-[var(--wait)] text-[#3a1b0e]"
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
    <article className="group relative overflow-hidden rounded-2xl border border-[#dfe9e2] bg-[var(--card)] p-3.5 shadow-[0_8px_20px_rgba(15,26,18,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,26,18,0.09)] sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#b7d7c2] opacity-20" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 space-y-2.5 sm:space-y-3">
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
            <h3 className="text-lg font-semibold leading-tight text-[var(--ink)] sm:text-xl">
              {session.name}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {isFull
                ? "This one is full, but the waitlist is open."
                : "Spaces are available for this session."}
            </p>
          </div>
        </div>

        <div className="flex min-w-[11rem] flex-col gap-2.5 sm:items-end sm:gap-3">
          <div className="w-full space-y-2 sm:w-44">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
              <span>{signedUp}/{session.capacity} booked</span>
              {waitlist > 0 && <span>{waitlist} waitlist</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#dde8df]">
              <div
                className={`h-full rounded-full ${
                  isFull ? "bg-[var(--accent)]" : "bg-[var(--ok)]"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Link
            href={`/sessions/${session.id}`}
            className={`w-full rounded-xl px-5 py-2.5 text-center text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 sm:w-auto sm:py-3 ${badgeClass}`}
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
    <div className={`relative overflow-hidden bg-[#e2ece6] ${className}`}>
      <img
        src={event.image_url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-white/30 to-[#dbeaf1]/45" />
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
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const suppressOpenAfterSwipeRef = useRef(false);

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

  const openActiveEvent = () => {
    if (suppressOpenAfterSwipeRef.current) return;
    openEventAt(activeIndex);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.changedTouches[0];
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (!touch || startX === null || startY === null || !hasMultipleEvents) {
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const isSwipe =
      Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;

    if (!isSwipe) return;

    suppressOpenAfterSwipeRef.current = true;
    if (deltaX < 0) {
      goNext();
    } else {
      goPrevious();
    }

    window.setTimeout(() => {
      suppressOpenAfterSwipeRef.current = false;
    }, 250);
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
    <section id="events" className="relative mb-9 scroll-mt-6 sm:mb-12">
      <div className="mb-3 sm:mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--cool)]">
            Events
          </p>
          <h2 className={`${sora.className} mt-1 text-2xl font-bold text-[var(--ink)]`}>
            What is happening next
          </h2>
        </div>
      </div>

      <div className="relative px-0 pt-4 sm:px-12 sm:pt-5">
        {hasMultipleEvents && (
          <>
            <div className="absolute left-10 right-10 top-0 h-16 rounded-t-xl border border-b-0 border-[#dfe9e2] bg-white/55 shadow-sm sm:left-24 sm:right-24" />
            <div className="absolute left-5 right-5 top-2 h-16 rounded-t-xl border border-b-0 border-[#dfe9e2] bg-white/75 shadow-sm sm:left-16 sm:right-16" />
          </>
        )}

        <article
          className="relative overflow-hidden rounded-2xl border border-[#dfe9e2] bg-[var(--card)] shadow-[0_14px_38px_rgba(20,42,30,0.09)] [touch-action:pan-y]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#c9e4cc] opacity-50 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-44 w-44 rounded-full bg-[#d7e6ff] opacity-60 blur-3xl" />
          <div
            className={`relative grid ${
              hasImage
                ? "min-h-[19rem] md:h-[21rem] md:grid-cols-[minmax(0,1.18fr)_minmax(240px,0.74fr)]"
                : "min-h-[10rem]"
            }`}
          >
            {hasImage && imageFirst && (
              <button
                type="button"
                onClick={openActiveEvent}
                className="block h-28 w-full overflow-hidden border-0 bg-transparent p-0 text-left leading-none md:order-first md:h-full"
                aria-label={`Open ${activeEvent.title}`}
              >
                <EventImagePanel event={activeEvent} className="h-full" />
              </button>
            )}

            <div
              role="button"
              tabIndex={0}
              onClick={openActiveEvent}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEventAt(activeIndex);
                }
              }}
              className="flex min-h-0 cursor-pointer flex-col gap-2.5 overflow-hidden p-4 text-left sm:p-6"
              aria-label={`Open ${activeEvent.title}`}
            >
              <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
                <h2 className={`${sora.className} text-[1.65rem] font-bold leading-tight text-[var(--ink)] sm:text-3xl`}>
                  {activeEvent.title}
                </h2>
                <div
                  className={
                    hasImage
                      ? "max-h-32 overflow-y-auto pr-1 sm:max-h-40 md:max-h-44"
                      : "overflow-visible pr-0"
                  }
                >
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
                onClick={openActiveEvent}
                className="block h-28 w-full overflow-hidden border-0 bg-transparent p-0 text-left leading-none md:h-full"
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
              className="absolute left-1 top-[calc(50%-1.5rem)] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] text-3xl font-semibold leading-none text-[var(--cool)] shadow-md ring-4 ring-[var(--paper)] transition hover:scale-105 hover:bg-[#f3f8f4] sm:flex"
              aria-label="Previous event"
            >
              &#8249;
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-1 top-[calc(50%-1.5rem)] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] text-3xl font-semibold leading-none text-[var(--cool)] shadow-md ring-4 ring-[var(--paper)] transition hover:scale-105 hover:bg-[#f3f8f4] sm:flex"
              aria-label="Next event"
            >
              &#8250;
            </button>

            <div className="relative z-10 mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={goPrevious}
                className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] px-3 text-xl font-semibold text-[var(--cool)] shadow-sm sm:hidden"
                aria-label="Previous event"
              >
                &#8249;
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-[#dfe9e2] bg-[var(--card)] px-3 py-2 shadow-sm">
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
                className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] px-3 text-xl font-semibold text-[var(--cool)] shadow-sm sm:hidden"
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
          className="fixed inset-0 z-50 overflow-y-auto bg-black/65 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6 md:flex md:items-center md:justify-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenEventIndex(null)}
        >
          <div
            className={`relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl bg-[var(--card)] shadow-2xl md:max-h-[94vh] ${
              openEvent.image_url
                ? "md:grid md:grid-cols-[minmax(0,1.18fr)_minmax(300px,0.82fr)]"
                : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenEventIndex(null)}
              className="fixed right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] text-2xl font-bold leading-none text-[var(--ink)] shadow-lg transition hover:scale-105 hover:bg-white md:absolute md:right-3 md:top-3"
              aria-label="Close event"
            >
              <span aria-hidden="true">&times;</span>
            </button>

            {openEvent.image_url && (
              <>
                <div className="bg-[#e2ece6] md:hidden">
                  <img
                    src={openEvent.image_url}
                    alt={openEvent.image_alt || ""}
                    className="block h-auto w-full object-contain"
                  />
                </div>
                <EventImagePanel
                  event={openEvent}
                  className="hidden min-h-0 md:block md:h-[92vh] md:max-h-none"
                  imageClassName="rounded-xl"
                />
              </>
            )}
            {hasMultipleEvents && (
              <>
                <button
                  type="button"
                  onClick={goModalPrevious}
                  className="absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg transition hover:scale-105 md:flex"
                  aria-label="Previous event"
                >
                  &#8249;
                </button>
                <button
                  type="button"
                  onClick={goModalNext}
                  className="absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-[#dfe9e2] bg-[var(--card)] text-3xl font-semibold leading-none text-[var(--cool)] shadow-lg transition hover:scale-105 md:flex"
                  aria-label="Next event"
                >
                  &#8250;
                </button>
              </>
            )}

            <div
              className="flex min-h-0 flex-col gap-3 p-4 pt-5 sm:p-5 sm:pt-6 md:max-h-[92vh] md:overflow-hidden md:p-7"
            >
              <div className="min-w-0 pr-12">
                <h2 className="text-xl font-semibold leading-tight text-[var(--ink)] sm:text-2xl">
                  {openEvent.title}
                </h2>
              </div>

              <div className="min-h-0 flex-1 pr-1 md:overflow-y-auto">
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
                    className="rounded-md bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm"
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
                    className="rounded-md bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--cool)] shadow-sm"
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
  const [isSessionsSectionVisible, setIsSessionsSectionVisible] =
    useState(false);
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

  useEffect(() => {
    const sessionsSection = document.getElementById("sessions");
    if (!sessionsSection) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsSessionsSectionVisible(Boolean(entry?.isIntersecting));
      },
      {
        threshold: 0.02,
      }
    );

    observer.observe(sessionsSection);

    return () => observer.disconnect();
  }, []);

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
          "--ink": "#0d1b14",
          "--muted": "#3f5048",
          "--paper": "#eef5ef",
          "--card": "#fffdf8",
          "--line": "#c9d8cf",
          "--accent": "#d96b45",
          "--ok": "#16613f",
          "--wait": "#f2b892",
          "--cool": "#1f567d",
          "--chip": "#f2f8f3",
        } as React.CSSProperties
      }
    >
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(180,214,188,0.58),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(185,211,232,0.42),transparent_30%),linear-gradient(135deg,#eef5ef_0%,#f7faf7_48%,#e8f2ec_100%)]" />
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/40" />
        <div className="absolute left-[8%] top-0 h-full w-px bg-white/25" />
        <div className="absolute right-[8%] top-0 h-full w-px bg-white/25" />
        <div className="absolute inset-x-0 top-52 h-px bg-white/30" />
        <div className="absolute inset-x-0 bottom-40 h-px bg-white/25" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-5 sm:px-8 sm:pb-20 sm:pt-6 lg:px-10">
        <nav className="mb-4 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadSessions("refresh")}
              disabled={loading || refreshing}
              className="rounded-lg border border-[#dfe9e2] bg-[var(--card)]/85 px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:py-1.5 sm:text-sm"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              href="/signin"
              className="rounded-lg bg-[var(--ok)] px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 sm:px-3.5 sm:py-1.5 sm:text-sm"
            >
              Admin sign in
            </Link>
          </div>
        </nav>

        <header className="relative mb-7 overflow-hidden rounded-2xl border border-[#d7e5dd] bg-[var(--card)]/78 p-6 shadow-[0_14px_40px_rgba(18,42,28,0.09)] backdrop-blur-xl sm:mb-8 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#c4dcf2] opacity-35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-16 h-72 w-72 rounded-full bg-[#cfe6d5] opacity-45 blur-3xl" />
          <div className="relative flex items-center gap-4 sm:gap-5">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[#dfe9e2] bg-[var(--card)] shadow-lg sm:h-20 sm:w-20">
              <Image
                src="/icon.png"
                alt="EUBC logo"
                fill
                sizes="(min-width: 640px) 80px, 64px"
                className="object-cover"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--cool)]">
                EUBC
              </p>
              <h1
                className={`${sora.className} text-4xl font-bold leading-[0.98] tracking-[-0.045em] text-[var(--ink)] sm:text-5xl lg:text-6xl`}
              >
                Badminton Club
              </h1>
            </div>
          </div>
        </header>

        <section id="noticeboard" className="mb-8 scroll-mt-6 sm:mb-10">
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--cool)]">
              Noticeboard
            </p>
            <h2 className={`${sora.className} mt-1 text-2xl font-bold text-[var(--ink)]`}>
              Club information
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setOpenBulletin("rules")}
              className="group flex min-h-10 items-center gap-2.5 rounded-xl border border-[#dfe9e2] bg-[var(--card)]/92 px-3 py-1.5 text-left shadow-[0_5px_16px_rgba(15,26,18,0.07)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white sm:rounded-full"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white shadow-sm">
                !
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-4">
                  {bulletin.club_rules_label}
                </span>
                <span className="block truncate text-xs leading-4 text-[var(--muted)]">
                  {bulletin.club_rules_description}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setOpenBulletin("info")}
              className="group flex min-h-10 items-center gap-2.5 rounded-xl border border-[#dfe9e2] bg-[var(--card)]/92 px-3 py-1.5 text-left shadow-[0_5px_16px_rgba(15,26,18,0.07)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white sm:rounded-full"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--cool)] text-xs font-bold text-white shadow-sm">
                i
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-4">
                  {bulletin.useful_info_label}
                </span>
                <span className="block truncate text-xs leading-4 text-[var(--muted)]">
                  {bulletin.useful_info_description}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={openCourtUpdates}
              className={`group relative flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-1.5 text-left backdrop-blur transition hover:-translate-y-0.5 hover:bg-white sm:rounded-full ${
                isCourtUpdateUrgent
                  ? "court-update-alert border border-[#e3a33e]/70 bg-[#fff2cb] shadow-[0_10px_24px_rgba(214,108,69,0.18)] ring-2 ring-[#f0be65]/35"
                  : "border border-[#dfe9e2] bg-[var(--card)]/92 shadow-[0_5px_16px_rgba(15,26,18,0.07)]"
              }`}
            >
              {isCourtUpdateUrgent && (
                <span className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_rgba(220,103,66,0.16)]" />
              )}
              <span
                 className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm ${
                  isCourtUpdateUrgent ? "bg-[var(--accent)]" : "bg-[var(--ok)]"
                }`}
              >
                *
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-4">
                  {bulletin.court_updates_label}
                </span>
                <span className="block truncate text-xs leading-4 text-[var(--muted)]">
                  {courtUpdateDescription}
                </span>
              </span>
            </button>
          </div>
        </section>

        <EventsBanner events={events} />

        {publicSettings.club_champs_public_enabled && (
          <section className="relative mb-10 overflow-hidden rounded-2xl border border-[#c9d8cf] bg-[linear-gradient(135deg,#eaf6ee_0%,#cbe5d2_52%,#a8d1b5_100%)] p-6 text-[var(--ink)] shadow-[0_12px_34px_rgba(37,86,56,0.1)] sm:mb-12 sm:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(255,255,255,0.48),transparent_30%),radial-gradient(circle_at_92%_8%,rgba(255,255,255,0.28),transparent_26%)]" />
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#2f5a40]">
                  Tournament mode
                </p>
                <h2 className={`${sora.className} mt-2 text-3xl font-bold`}>
                  Club champs live hub
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#3f5048]">
                  Follow tournament progress, results, and updates from the committee.
                </p>
              </div>
              <Link
                href="/club-champs"
                className="relative rounded-xl border border-[#76aa82]/45 bg-[var(--card)]/88 px-5 py-3 text-sm font-bold text-[#0b3a25] shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
              >
                Open Club champs
              </Link>
            </div>
          </section>
        )}

        <section id="sessions" className="scroll-mt-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--cool)]">
                Booking board
              </p>
              <h2 className={`${sora.className} mt-1 text-3xl font-bold text-[var(--ink)]`}>
                Weekly sessions
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Book a weekly session below. If a session is full, join the
                waitlist and you will be promoted and notified automatically
                when a space opens.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#dfe9e2] bg-[var(--card)] p-8 shadow-sm">
              Loading sessions...
            </div>
          ) : !publicSettings.sessions_public_enabled ? (
            <div className="rounded-2xl border border-[#dfe9e2] bg-[var(--card)] p-8 shadow-sm">
              Session booking is currently hidden by the committee.
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-[#dfe9e2] bg-[var(--card)] p-8 shadow-sm">
              No sessions yet.
            </div>
          ) : (
            <div className="space-y-8 sm:space-y-10">
              {grouped.map((group) => {
                const first = group.sessions[0]?.starts_at;
                if (!first) return null;
                return (
                  <section key={group.key} className="space-y-3 sm:space-y-4">
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

      {!isSessionsSectionVisible && (
        <Link
          href="#sessions"
          className="fixed bottom-4 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/70 bg-[var(--ok)] px-4 py-2 text-sm font-bold text-white shadow-[0_10px_26px_rgba(22,97,63,0.22)] backdrop-blur transition hover:-translate-y-0.5 sm:hidden"
        >
          Book a session
          <span aria-hidden="true">v</span>
        </Link>
      )}

      {openBulletin && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenBulletin(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#dfe9e2] bg-[var(--card)] shadow-[0_22px_60px_rgba(0,0,0,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--cool)]">
                    Committee note
                  </p>
                  <h3 className={`${sora.className} mt-2 text-2xl font-bold`}>
                    {openBulletinTitle}
                  </h3>
                </div>
                <button
                  className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-2 text-sm font-semibold transition hover:bg-white"
                  onClick={() => setOpenBulletin(null)}
                >
                  Close
                </button>
              </div>
              <div className="mt-4 max-h-[68vh] space-y-3 overflow-y-auto rounded-xl border border-[var(--line)] bg-white/70 p-4 text-base leading-7 text-[#17231c] sm:p-5">
                {renderNoticeboardBody(openBulletinBody)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
