"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ZoomBracketProps = {
  contentWidth: number;
  contentHeight: number;
  children: React.ReactNode;
};

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.7;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ZoomBracket({
  contentWidth,
  contentHeight,
  children,
}: ZoomBracketProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateFit = () => {
      const width = containerRef.current?.clientWidth ?? contentWidth;
      const nextFit = clamp((width - 24) / contentWidth, MIN_ZOOM, 1);
      setFitZoom(nextFit);
      if (!initializedRef.current) {
        setZoom(nextFit);
        initializedRef.current = true;
      }
    };

    updateFit();
    const observer = new ResizeObserver(updateFit);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [contentWidth]);

  const scaledWidth = useMemo(() => Math.round(contentWidth * zoom), [contentWidth, zoom]);
  const scaledHeight = useMemo(() => Math.round(contentHeight * zoom), [contentHeight, zoom]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          Zoom and pan the bracket for easier viewing.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((current) => clamp(current - 0.1, MIN_ZOOM, MAX_ZOOM))}
            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--cool)]"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setZoom(fitZoom)}
            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--cool)]"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => setZoom((current) => clamp(current + 0.1, MIN_ZOOM, MAX_ZOOM))}
            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--cool)]"
          >
            +
          </button>
          <span className="ml-1 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-auto rounded-xl border border-[var(--line)] bg-white/80 p-2"
      >
        <div style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}>
          <div
            style={{
              width: `${contentWidth}px`,
              height: `${contentHeight}px`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
