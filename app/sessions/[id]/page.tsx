"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Space_Grotesk } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";
import { displaySessionName, formatSessionDateTime } from "@/lib/session-display";

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
  show_public_signup_names?: boolean;
  confirmed_names?: string[];
  waitlist_names?: string[];
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"book" | "players">("book");
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
      if (!data.show_public_signup_names) setActiveTab("book");
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

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab = activeTab === "book" ? "players" : "book";
    setActiveTab(nextTab);
    document.getElementById(`${nextTab}-tab`)?.focus();
  }

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
        else if (raw.includes("invalid student_id") || raw.includes("invalid student id")) {
          setMessage("Student ID must be in the format s1234567.");
        }
        else if (raw.includes("membership required")) {
          setMessage("Paid EUBC club membership is required to book this session.");
        }
        else if (raw.includes("member identity mismatch")) {
          setMessage("This student ID and email do not match the same member. Check them, or leave Student ID blank if you do not have one.");
        }
        else if (raw.includes("same-day booking not allowed")) {
          setMessage("You can only book one session per day.");
        }
        else if (raw.includes("whitelisted")) {
          setMessage(
            allowNameOnly
              ? "Signup blocked by session rules."
              : "Paid EUBC club membership is required to book this session."
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
      loadSession("refresh").catch(() => {});
    } catch (err: unknown) {
      const maybeError = err as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      const raw =
        (
          maybeError.message ||
          maybeError.details ||
          maybeError.hint ||
          maybeError.code ||
          ""
        ).toLowerCase();
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
            "--muted": "#4b5866",
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
            "--muted": "#4b5866",
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
          "--muted": "#4b5866",
          "--paper": "#f6f1e9",
          "--card": "#ffffff",
          "--line": "#e6ddd1",
          "--accent": "#ba8500ff",
          "--ok": "#1f7a50",
          "--wait": "#f0b49b",
          "--cool": "#3f8fce",
          "--chip": "#eef5ff",
        } as React.CSSProperties
      }
    >
      <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-10">
        <div className="pointer-events-none absolute -left-24 top-0 h-48 w-48 rounded-full bg-[#fde9b0] opacity-60 blur-3xl -z-10" />
        <div className="pointer-events-none absolute right-0 top-10 h-40 w-40 rounded-full bg-[#d9ecff] opacity-70 blur-3xl -z-10" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm text-[var(--muted)] underline underline-offset-2">
            ← All sessions
          </Link>
          <button
            type="button"
            onClick={() => loadSession("refresh")}
            disabled={refreshing}
            className="rounded-lg px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <header className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
          <h1 className="text-2xl font-semibold leading-tight sm:text-[1.7rem]">
            {displaySessionName(session.name, session.starts_at, session.ends_at)}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {formatSessionDateTime(session.starts_at, session.ends_at)}
          </p>
          {session.notes && (
            <p className="mt-3 text-sm text-[var(--muted)]">{session.notes}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] pt-4 text-sm">
            <span className="font-semibold text-[var(--ink)]">
              {statsLoading ? "Checking availability" : isFull ? "Full" : "Spots available"}
            </span>
            {!statsLoading && (
              <span className="text-[var(--muted)]">
                {signedUp}/{session.capacity} booked · {waitlist} waiting
              </span>
            )}
            <span className="text-[var(--muted)] sm:ml-auto">
              {allowNameOnly ? "No club membership needed" : "Members or first-time tasters"}
            </span>
          </div>
        </header>

        <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm">
        {session.show_public_signup_names && (
          <div className="flex border-b border-[var(--line)] px-2 pt-2" role="tablist" aria-label="Session details">
            <button
              id="book-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "book"}
              aria-controls="book-panel"
              tabIndex={activeTab === "book" ? 0 : -1}
              onKeyDown={handleTabKeyDown}
              onClick={() => setActiveTab("book")}
              className={`flex-1 border-b-2 px-3 py-3 text-sm font-semibold transition ${activeTab === "book" ? "border-[var(--ok)] text-[var(--ink)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"}`}
            >
              Book a spot
            </button>
            <button
              id="players-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "players"}
              aria-controls="players-panel"
              tabIndex={activeTab === "players" ? 0 : -1}
              onKeyDown={handleTabKeyDown}
              onClick={() => setActiveTab("players")}
              className={`flex-1 border-b-2 px-3 py-3 text-sm font-semibold transition ${activeTab === "players" ? "border-[var(--ok)] text-[var(--ink)]" : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"}`}
            >
              Who&apos;s going
            </button>
          </div>
        )}

        {session.show_public_signup_names && activeTab === "players" && (
          <section
            id="players-panel"
            role="tabpanel"
            aria-labelledby="players-tab"
            className="p-5 sm:p-6"
          >
            {(session.confirmed_names?.length ?? 0) === 0 ? (
              <p className="rounded-xl bg-[var(--chip)] p-4 text-sm text-[var(--muted)]">
                No bookings yet.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Booked players">
                {session.confirmed_names?.map((player, index) => (
                  <li key={`${player}-${index}`} className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm font-medium">
                    {player}
                  </li>
                ))}
              </ul>
            )}
            {(session.waitlist_names?.length ?? 0) > 0 && (
              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">Waitlist ({session.waitlist_names?.length})</h2>
                <ul className="grid gap-2 sm:grid-cols-2" aria-label="Waitlisted players">
                  {session.waitlist_names?.map((player, index) => (
                    <li key={`${player}-${index}`} className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm font-medium">
                      {player}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {(!session.show_public_signup_names || activeTab === "book") && (
        <form
          id={session.show_public_signup_names ? "book-panel" : undefined}
          role={session.show_public_signup_names ? "tabpanel" : undefined}
          aria-labelledby={session.show_public_signup_names ? "book-tab" : undefined}
          onSubmit={submitBooking}
          className="space-y-4 p-5 sm:space-y-5 sm:p-6"
        >
          {!session.show_public_signup_names && (
            <h2 className="text-lg font-semibold">Book a spot</h2>
          )}
          {!allowNameOnly && (
            <details className="group text-sm">
              <summary className="w-fit cursor-pointer font-medium text-[var(--ok)] underline underline-offset-2 marker:text-[var(--ok)]">
                Membership rules
              </summary>
              <p className="mt-2 rounded-lg bg-[var(--chip)] px-3 py-2.5 text-[var(--muted)]">
                Members can book this session. Without club membership, you can book one
                first-time taster; after that, paid EUBC club membership is required.
              </p>
            </details>
          )}

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="signup-name" className="text-xs sm:text-sm">Name (required)</label>
              <input
                id="signup-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] p-2.5 text-sm"
                placeholder="Full name"
                required
              />
            </div>
            {!allowNameOnly && (
              <div>
                <label htmlFor="signup-student-id" className="text-xs sm:text-sm">Student ID (required for students)</label>
                <input
                  id="signup-student-id"
                  name="studentId"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value.toLowerCase())}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] p-2.5 text-sm"
                  placeholder="s1234567"
                />
              </div>
            )}
            <div className={allowNameOnly ? "sm:col-span-2" : ""}>
              <label htmlFor="signup-email" className="text-xs sm:text-sm">Email (required)</label>
              <input
                id="signup-email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--line)] p-2.5 text-sm"
                placeholder="you@example.com"
                type="email"
                required
              />
            </div>
          </div>
          {allowNameOnly && (
            <p className="text-xs text-[var(--muted)] sm:text-sm">
              Gym/Pleasance access is still required to attend.
            </p>
          )}

          {message && <p role="status" className="text-sm text-[var(--ink)]">{message}</p>}

          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-[var(--muted)] sm:max-w-sm">
              We&apos;ll email your confirmation and cancellation link. Check junk mail,
              especially with university Outlook.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className={`w-full shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
                isFull ? "bg-[var(--wait)] text-[var(--ink)]" : "bg-[var(--ok)] text-white"
              }`}
            >
              {submitting ? "Submitting..." : isFull ? "Join waitlist" : "Book a spot"}
            </button>
          </div>
        </form>
        )}
        </div>

        {result && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-lg">
              <h3 className="text-lg font-semibold">
                {result.status === "signed_up" ? "You're booked!" : "You're on the waitlist"}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {result.status === "signed_up"
                  ? "Your booking is confirmed."
                  : "We'll let you know if a spot opens up."}
              </p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                A confirmation email has been sent to{" "}
                <span className="font-medium text-[var(--ink)]">{result.email}</span> with your
                cancellation link. If you can&apos;t make it, please cancel using that link so someone
                else can take the spot.
              </p>
              <div className="mt-5 rounded-xl border-2 border-[#d66c45] bg-[#fff1df] p-4 text-[#4b2414] shadow-sm">
                <p className="text-base font-extrabold uppercase tracking-wide">
                  Important: check junk mail
                </p>
                <p className="mt-2 text-sm font-bold leading-6">
                  If you are using a school/university Outlook account, the
                  confirmation email may go to Junk Email. Please check junk,
                  mark it as not junk, and move it back to your inbox so future
                  booking and cancellation emails are easier to find.
                </p>
              </div>
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
