"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ZoomBracketProps = {
  contentWidth: number;
  contentHeight: number;
  children: React.ReactNode;
};

const MIN_ZOOM = 0.22;
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
  const pinchRef = useRef<{
    active: boolean;
    startDistance: number;
    startZoom: number;
  }>({
    active: false,
    startDistance: 0,
    startZoom: 1,
  });

  function touchDistance(
    t1: { clientX: number; clientY: number },
    t2: { clientX: number; clientY: number }
  ) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">
          Zoom and pan the bracket for easier viewing.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((current) => clamp(current - 0.1, MIN_ZOOM, MAX_ZOOM))}
            className="h-8 min-w-8 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--cool)]"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setZoom(fitZoom)}
            className="h-8 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--cool)]"
          >
            Fit
          </button>
          <button
            type="button"
            onClick={() => setZoom((current) => clamp(current + 0.1, MIN_ZOOM, MAX_ZOOM))}
            className="h-8 min-w-8 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs font-semibold text-[var(--cool)]"
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
        className="max-h-[72vh] overflow-auto rounded-xl border border-[var(--line)] bg-white/85 p-2"
        onTouchStart={(event) => {
          if (event.touches.length < 2) return;
          const distance = touchDistance(event.touches[0], event.touches[1]);
          pinchRef.current = {
            active: true,
            startDistance: distance,
            startZoom: zoom,
          };
        }}
        onTouchMove={(event) => {
          if (!pinchRef.current.active || event.touches.length < 2) return;
          const distance = touchDistance(event.touches[0], event.touches[1]);
          const ratio = distance / pinchRef.current.startDistance;
          const nextZoom = clamp(
            pinchRef.current.startZoom * ratio,
            MIN_ZOOM,
            MAX_ZOOM
          );
          setZoom(nextZoom);
        }}
        onTouchEnd={(event) => {
          if (event.touches.length < 2) {
            pinchRef.current.active = false;
          }
        }}
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
