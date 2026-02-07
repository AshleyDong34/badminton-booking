"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Space_Grotesk } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";

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
  allow_name_only?: boolean | null;
  signed_up_count?: number;
  waitlist_count?: number;
};

function formatDateTime(startIso: string | null, endIso?: string | null) {
  if (!startIso) return "TBC";
  const day = new Date(startIso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const start = new Date(startIso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = endIso
    ? new Date(endIso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return end ? `${day} | ${start} to ${end}` : `${day} | ${start}`;
}


export default function SessionBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [session, setSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [signedUp, setSignedUp] = useState(0);
  const [waitlist, setWaitlist] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        status: "signed_up" | "waiting_list";
        email: string;
      }
  >(null);
  const [showRules, setShowRules] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(true);

  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");

  const isFull = !statsLoading && session && signedUp >= session.capacity;
  const allowNameOnly = Boolean(session?.allow_name_only);

  const loadSession = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!sessionId) return;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      const res = await fetch(`/api/public/sessions/${sessionId}`, { cache: "no-store" });
      if (!activeRef.current) return;

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        setSession(null);
        setMessage(errorJson.error || "Session not found.");
        setSignedUp(0);
        setWaitlist(0);
        if (mode === "initial") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
        return;
      }

      const json = await res.json().catch(() => ({}));
      const data = json.session as SessionRow | undefined;
      if (!data) {
        setSession(null);
        setMessage("Session not found.");
        if (mode === "initial") setLoading(false);
        if (mode === "refresh") setRefreshing(false);
        return;
      }

      setSession(data);
      setSignedUp(data.signed_up_count ?? 0);
      setWaitlist(data.waitlist_count ?? 0);
      setStatsLoading(false);

      if (mode === "initial") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    },
    [sessionId]
  );

  useEffect(() => {
    if (!sessionId) return;

    activeRef.current = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => loadSession("refresh"), 20000);
    };

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const handleVisibility = () => {
      if (!activeRef.current) return;
      if (document.visibilityState === "visible") {
        loadSession("refresh");
        startPolling();
      } else {
        stopPolling();
      }
    };

    loadSession("initial");
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      activeRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadSession, sessionId]);

  const hint = useMemo(() => {
    if (!session) return "";
    if (statsLoading) return "Checking availability...";
    if (isFull) return "This session is full. New signups will join the waitlist.";
    return "Spots are available.";
  }, [session, statsLoading, isFull]);

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;

    setMessage(null);
    setResult(null);

    const trimmed = name.trim();
    const sidRaw = studentId.trim();
    const sid = sidRaw ? sidRaw.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const mail = email.trim();

    if (!trimmed) {
      setMessage("Enter your name.");
      return;
    }
    if (!mail || !mail.includes("@")) {
      setMessage("Enter a valid email.");
      return;
    }
    if (sid && !/^s\d{7}$/.test(sid)) {
      setMessage("Student ID must be in the format s1234567.");
      return;
    }
    try {
      setSubmitting(true);
      const { data, error } = await supabase.rpc("insert_signup_guarded", {
        p_session_id: sessionId,
        p_name: trimmed,
        p_student_id: sid || null,
        p_email: mail,
      });

      if (error) {
        const raw =
          (error.message || error.details || error.hint || error.code || "").toLowerCase();
        if (raw.includes("weekly limit")) setMessage("Weekly limit reached.");
        else if (raw.includes("first_time_requires_student_id")) {
          setMessage("First-time signup requires a student ID.");
        }
        else if (raw.includes("invalid student_id") || raw.includes("invalid student id")) {
          setMessage("Student ID must be in the format s1234567.");
        }
        else if (raw.includes("membership required")) {
          setMessage("Paid membership is required to book this session.");
        }
        else if (raw.includes("whitelisted")) {
          setMessage(
            allowNameOnly
              ? "Signup blocked by session rules."
              : "Paid membership is required to book this session."
          );
        }
        else if (raw.includes("student_id required") || raw.includes("student id required"))
          setMessage("Email or student ID is required for this session.");
        else if (raw.includes("duplicate") || raw.includes("unique"))
          setMessage("Duplicate signup detected for this session.");
        else if (raw.includes("session not found")) setMessage("Session no longer exists.");
        else setMessage(`Could not add signup. (${raw || "unknown error"})`);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row?.r_status === "signed_up") {
        setMessage("You are booked. See you on court.");
        setResult({ status: "signed_up", email: mail });
      } else if (row?.r_status === "waiting_list") {
        setMessage("Session is full. You are on the waitlist.");
        setResult({ status: "waiting_list", email: mail });
      } else {
        setMessage("Signup received.");
      }

      if (row?.r_cancel_token) {
        fetch("/api/public/signup-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancelToken: row.r_cancel_token }),
        }).catch(() => {});
      }

      setName("");
      setStudentId("");
      setEmail("");
    } catch (err: any) {
      const raw =
        (err?.message || err?.details || err?.hint || err?.code || "").toLowerCase();
      setMessage(`Could not add signup. (${raw || "unexpected"})`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
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
            "--wait": "#f0b49b",
            "--cool": "#3f8fce",
            "--chip": "#eef5ff",
          } as React.CSSProperties
        }
      >
        <div className="mx-auto max-w-3xl px-5 py-12">Loading session...</div>
      </div>
    );
  }

  if (!session) {
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
            "--wait": "#f0b49b",
            "--cool": "#3f8fce",
            "--chip": "#eef5ff",
          } as React.CSSProperties
        }
      >
        <div className="mx-auto max-w-3xl px-5 py-12">
          <p className="text-sm text-[var(--muted)]">{message ?? "Session not found."}</p>
          <button
            className="mt-4 rounded-xl border border-[var(--line)] px-4 py-2"
            onClick={() => router.push("/")}
          >
            Back to sessions
          </button>
        </div>
      </div>
    );
  }

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
          "--accent": "#ba8500ff",
          "--ok": "#2f9f67",
          "--wait": "#f0b49b",
          "--cool": "#3f8fce",
          "--chip": "#eef5ff",
        } as React.CSSProperties
      }
    >
      <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-10">
        <div className="pointer-events-none absolute -left-24 top-0 h-48 w-48 rounded-full bg-[#fde9b0] opacity-60 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-10 h-40 w-40 rounded-full bg-[#d9ecff] opacity-70 blur-3xl" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm text-[var(--muted)] underline">
            Back to all sessions
          </Link>
          <button
            type="button"
            onClick={() => loadSession("refresh")}
            disabled={refreshing}
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-xs font-medium text-[var(--muted)] shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{session.name}</h1>
              <span
                className={`rounded-full border px-3 py-1 text-xs ${
                  allowNameOnly
                    ? "border-[var(--ok)] bg-[var(--chip)] text-[var(--ok)] font-medium"
                    : "border-[#f2d3c7] bg-[#fff1ea] text-[#c9826c] font-semibold"
                }`}
              >
                {allowNameOnly ? "Membership not required" : "Membership required"}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {formatDateTime(session.starts_at, session.ends_at)}
            </p>
            {session.notes ? (
              <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs text-[var(--ink)]">
                {session.notes}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            {statsLoading ? (
              <span>Loading availability...</span>
            ) : (
              <>
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {signedUp}/{session.capacity} booked
                </span>
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {waitlist} waitlist
                </span>
              </>
            )}
            <span className={isFull ? "text-[var(--accent)]" : "text-[var(--ok)]"}>
              {hint}
            </span>
          </div>
        </div>

        <form
          onSubmit={submitBooking}
          className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5"
        >
          <div className="space-y-2">
            <h2 className="text-base font-semibold sm:text-lg">Book your spot</h2>
            <p className="text-xs text-[var(--muted)] sm:text-sm">
              Enter your details below. You will get a confirmation email with a cancel link.
            </p>
          </div>
          {!allowNameOnly && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3">
              <button
                type="button"
                onClick={() => setShowRules((prev) => !prev)}
                className="flex w-full items-center justify-between text-sm font-medium text-[var(--ink)]"
              >
                <span>Membership rules</span>
                <span className="text-xs text-[var(--muted)]">
                  {showRules ? "Hide" : "View"}
                </span>
              </button>
              {showRules && (
                <div className="mt-2 text-xs text-[var(--muted)] sm:text-sm">
                  This session requires paid membership. You get one taster session without
                  membership; after that, you&apos;ll need membership to keep booking.
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs sm:text-sm">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] p-2.5 text-sm"
                placeholder="Full name"
                required
              />
            </div>
            {allowNameOnly ? (
              <div className="sm:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-xs text-[var(--muted)] sm:text-sm">
                No membership needed for this session. Only name and email are required.
              </div>
            ) : (
              <div>
                <label className="text-xs sm:text-sm">Student ID (required)</label>
                <input
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.toLowerCase())}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] p-2.5 text-sm"
                  placeholder="s1234567"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Leave blank only if you don&apos;t have one.
                </p>
              </div>
            )}
            <div className={allowNameOnly ? "sm:col-span-2" : ""}>
              <label className="text-xs sm:text-sm">Email (required)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] p-2.5 text-sm"
                placeholder="you@example.com"
                type="email"
                required
              />
            </div>
          </div>

          {message && <p className="mt-2 text-xs text-[var(--muted)] sm:text-sm">{message}</p>}

          <button
            disabled={submitting}
            className={`w-full sm:w-auto rounded-xl px-4 py-2 text-sm font-semibold shadow-sm ${
              isFull ? "bg-[var(--wait)] text-[var(--ink)]" : "bg-[var(--ok)] text-white"
            }`}
          >
            {submitting ? "Submitting..." : isFull ? "Join waitlist" : "Join signup"}
          </button>
        </form>

        {result && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-lg">
              <h3 className="text-lg font-semibold">
                {result.status === "signed_up" ? "You’re booked!" : "You’re on the waitlist"}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {result.status === "signed_up"
                  ? "Your booking is confirmed."
                  : "We’ll let you know if a spot opens up."}
              </p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                A confirmation email has been sent to{" "}
                <span className="font-medium text-[var(--ink)]">{result.email}</span> with your
                cancellation link. If you can’t make it, please cancel using that link so someone
                else can take the spot.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm"
                  onClick={() => setResult(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
