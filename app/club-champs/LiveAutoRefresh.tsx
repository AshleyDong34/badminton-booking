"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function LiveAutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      router.refresh();
      setLastRefresh(new Date());
    };

    const start = () => {
      if (interval) return;
      interval = setInterval(refresh, intervalMs);
    };

    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, router]);

  const refreshedAt = useMemo(() => {
    if (!lastRefresh) return "not refreshed yet";
    return lastRefresh.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [lastRefresh]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs text-[var(--muted)]">
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--ok)]" />
        Live updates every {Math.round(intervalMs / 1000)}s while tab is visible
      </span>
      <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5">
        Last refresh: {refreshedAt}
      </span>
    </div>
  );
}
