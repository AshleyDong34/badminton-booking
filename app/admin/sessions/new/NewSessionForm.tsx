"use client";

import { useEffect, useMemo, useState } from "react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nowRoundedToNext15Min() {
  const d = new Date();
  const mins = d.getMinutes();
  const rounded = Math.ceil(mins / 15) * 15;
  d.setMinutes(rounded === 60 ? 0 : rounded, 0, 0);
  if (rounded === 60) d.setHours(d.getHours() + 1);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Build "YYYY-MM-DDTHH:MM" for datetime-local
function toDT(date: string, time: string) {
  return `${date}T${time}`;
}

function addMinutes(date: string, time: string, minsToAdd: number) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  dt.setMinutes(dt.getMinutes() + minsToAdd);

  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
  };
}

/* ---------- Name generation helpers (mirror server) ---------- */
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function autoSessionName(startLocal: Date, endLocal: Date) {
  const weekday = startLocal.toLocaleDateString("en-GB", { weekday: "long" });
  const day = ordinal(startLocal.getDate());
  const startT = formatTime(startLocal);
  const endT = formatTime(endLocal);
  return `${weekday} ${day} ${startT}-${endT}`;
}
/* ------------------------------------------------------------ */

type NewSessionFormProps = {
  defaultAllowNameOnly?: boolean;
};

export default function NewSessionForm({
  defaultAllowNameOnly = false,
}: NewSessionFormProps) {
  // Optional override; if blank we auto-generate on server and show preview here
  const [nameOverride, setNameOverride] = useState("");
  const [notes, setNotes] = useState("");

  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState(nowRoundedToNext15Min());

  // default duration = 90 mins
  const [durationMin, setDurationMin] = useState(90);

  // End follows start+duration unless manually edited
  const [endDate, setEndDate] = useState(todayStr());
  const [endTime, setEndTime] = useState("00:00");
  const [endManual, setEndManual] = useState(false);

  // default capacity = 2
  const [capacity, setCapacity] = useState(2);
  const [allowNameOnly, setAllowNameOnly] = useState(defaultAllowNameOnly);

  // Keep end synced unless manually overridden
  useEffect(() => {
    if (endManual) return;
    const out = addMinutes(date, startTime, durationMin);
    setEndDate(out.date);
    setEndTime(out.time);
  }, [date, startTime, durationMin, endManual]);

  const start = useMemo(() => toDT(date, startTime), [date, startTime]);
  const end = useMemo(() => toDT(endDate, endTime), [endDate, endTime]);

  // Live preview of what the auto-generated name will look like
  const previewName = useMemo(() => {
    const trimmed = nameOverride.trim();
    if (trimmed) return trimmed;

    const startLocal = new Date(start);
    const endLocal = new Date(end);

    if (isNaN(startLocal.getTime()) || isNaN(endLocal.getTime())) return "";
    if (!(endLocal > startLocal)) return "";

    return autoSessionName(startLocal, endLocal);
  }, [nameOverride, start, end]);

  return (
    <form action="/api/admin/sessions" method="post" className="space-y-4">
      {/* what API reads */}
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="end" value={end} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm">Date</label>
          <input
            type="date"
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm">Start time</label>
          <input
            type="time"
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm">Duration</label>
        <select
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          value={durationMin}
          onChange={(e) => {
            setDurationMin(Number(e.target.value));
            setEndManual(false);
          }}
        >
          <option value={60}>1:00</option>
          <option value={75}>1:15</option>
          <option value={90}>1:30 (default)</option>
          <option value={105}>1:45</option>
          <option value={120}>2:00</option>
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm">End date</label>
          <input
            type="date"
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setEndManual(true);
            }}
          />
        </div>

        <div>
          <label className="block text-sm">End time</label>
          <input
            type="time"
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            value={endTime}
            onChange={(e) => {
              setEndTime(e.target.value);
              setEndManual(true);
            }}
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="button"
            className="text-sm text-[var(--muted)] underline"
            onClick={() => setEndManual(false)}
          >
            Reset end to auto (start + duration)
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm">Capacity</label>
        <input
          name="capacity"
          type="number"
          min={1}
          required
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
        <input
          name="allow_name_only"
          type="checkbox"
          value="true"
          checked={allowNameOnly}
          onChange={(e) => setAllowNameOnly(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm">
          <span className="block font-medium">Allow name + email only</span>
          <span className="block text-xs text-[var(--muted)]">
            Skip student ID and whitelist checks for this session.
          </span>
        </span>
      </label>

      <div>
        <label className="block text-sm">Name (optional)</label>
        <input
          name="name"
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          value={nameOverride}
          onChange={(e) => setNameOverride(e.target.value)}
          placeholder="Leave blank to auto-generate"
        />
        {previewName && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            <span className="font-medium">
              {nameOverride.trim() ? "Using custom name:" : "Auto-generated name:"}
            </span>{" "}
            <span className="italic">{previewName}</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm">Notes (optional)</label>
        <input
          name="notes"
          type="text"
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
        Create
      </button>

      <p className="text-sm text-[var(--muted)]">
        Will submit: <span className="font-mono">{start}</span> to{" "}
        <span className="font-mono">{end}</span>
      </p>
    </form>
  );
}
