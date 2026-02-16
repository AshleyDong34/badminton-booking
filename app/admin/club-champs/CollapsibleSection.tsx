"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  anchorId?: string;
  children: ReactNode;
};

export default function CollapsibleSection({
  id,
  title,
  subtitle,
  defaultOpen = true,
  anchorId,
  children,
}: Props) {
  const storageKey = useMemo(() => `club-champs-collapsed:${id}`, [id]);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "1") setOpen(false);
      if (stored === "0") setOpen(true);
    } catch {
      // Ignore storage failures.
    }
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "0" : "1");
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }

  return (
    <section
      id={anchorId}
      className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-sm sm:space-y-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 sm:items-center">
        <div className="space-y-1">
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          {subtitle ? <p className="text-xs text-[var(--muted)] sm:text-sm">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={toggle}
          className="shrink-0 rounded-xl border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--cool)] shadow-sm sm:px-3 sm:py-1.5 sm:text-xs"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--muted)] sm:text-sm">
          Hidden. Use "Show" to expand this section.
        </p>
      )}
    </section>
  );
}
