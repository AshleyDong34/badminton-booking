"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

// Minimal row types (helps TypeScript autocomplete)
type SignupRow = {
  id: string;
  session_id: string;
  name: string;
  status: "signed_up" | "waiting_list";
  notes: string | null;
  created_at: string;
  student_id?: string | null;
  email?: string | null;
  cancel_token?: string | null;
};

type SessionRow = {
  id: string;
  name: string;
  capacity: number;
  starts_at: string | null;
  ends_at?: string | null; 
  notes: string | null;
  created_at: string;
};

function formatDateHeading(iso: string) {
  // Example: "Wednesday 24 December 2025"
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dateKey(iso: string) {
  // Group key: YYYY-MM-DD in local time
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------------------------------------------
   SessionCard: encapsulates the entire logic for ONE session.
------------------------------------------------ */
function SessionCard({ session }: { session: SessionRow }) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [bookings, setBookings] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastCancelUrl, setLastCancelUrl] = useState<string | null>(null);

  // Fetch all signups for this session (once on mount)
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: signupRows, error: signupErr } = await supabase
        .from("signups")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });

      if (signupErr) {
        console.error("Failed to load signups:", signupErr);
      } else if (signupRows) {
        const rows = signupRows as SignupRow[];
        setBookings(rows.filter(r => r.status === "signed_up").map(r => r.name));
        setWaitlist(rows.filter(r => r.status === "waiting_list").map(r => r.name));
      }

      setLoading(false);
    };

    load();
  }, [session.id]);

  // Realtime subscription for THIS session only
  useEffect(() => {
    const channel = supabase
      .channel(`signups-realtime-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signups",
          filter: `session_id=eq.${session.id}`,
        },
        async () => {
          const { data, error } = await supabase
            .from("signups")
            .select("*")
            .eq("session_id", session.id)
            .order("created_at", { ascending: true });

          if (!error && data) {
            const rows = data as SignupRow[];
            setBookings(rows.filter(r => r.status === "signed_up").map(r => r.name));
            setWaitlist(rows.filter(r => r.status === "waiting_list").map(r => r.name));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  // Add a signup via SERVER RPC (single source of truth)
  const addBooking = async () => {
    const trimmed = name.trim();
    const sid = studentId.trim();
    const mail = email.trim();

    if (!trimmed) {
      alert("Enter your name!");
      return;
    }
    if (!sid) {
      alert("Enter your student ID (must be on whitelist).");
      return;
    }
    if (!mail || !mail.includes("@")) {
      alert("Enter a valid email.");
      return;
    }

    // Removed: client-side same-name duplicate check
    // (Multiple people can share the same name. DB uniqueness should be on student_id or token.)

    try {
      const { data, error } = await supabase.rpc("insert_signup_guarded", {
        p_session_id: session.id,
        p_name: trimmed,
        p_student_id: sid,
        p_email: mail,
      });

      if (error) {
        const raw = (error.message || error.details || error.hint || error.code || "").toLowerCase();
        console.debug("RPC insert_signup_guarded error:", raw);

        if (raw.includes("weekly limit")) alert("You’ve reached the weekly limit for this week.");
        else if (raw.includes("whitelisted")) alert("Signup blocked: your student ID is not on the whitelist.");
        else if (raw.includes("duplicate") || raw.includes("unique")) alert("Duplicate signup detected for this session.");
        else if (raw.includes("session not found")) alert("This session no longer exists.");
        else alert(`Could not add signup. (${raw || "unknown error"})`);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (row?.r_status === "signed_up") {
        setBookings(prev => [...prev, trimmed]);
      } else if (row?.r_status === "waiting_list") {
        setWaitlist(prev => [...prev, trimmed]);
        alert("Session full – added to waitlist.");
      } else {
        // fallback refetch (shouldn't happen)
        const { data: fresh } = await supabase
          .from("signups")
          .select("name,status")
          .eq("session_id", session.id)
          .order("created_at", { ascending: true });

        const names = (fresh ?? []) as { name: string; status: "signed_up" | "waiting_list" }[];
        const me = names.find(n => n.name === trimmed);

        if (me?.status === "signed_up") setBookings(prev => [...prev, trimmed]);
        else {
          setWaitlist(prev => [...prev, trimmed]);
          alert("Session full – added to waitlist.");
        }
      }

      if (row?.r_cancel_token) {
        const url = `${window.location.origin}/cancel?token=${row.r_cancel_token}`;
        setLastCancelUrl(url);
      }

      setName("");
      setStudentId("");
      setEmail("");
    } catch (e: any) {
      const raw = (e?.message || e?.details || e?.hint || e?.code || "").toLowerCase();
      console.debug("RPC threw:", raw);
      alert(`Could not add signup. (${raw || "unexpected"})`);
    }
  };

  const timeLine = useMemo(() => {
    if (!session.starts_at) return null;
    const startT = formatTimeOnly(session.starts_at);
    const endT = session.ends_at ? formatTimeOnly(session.ends_at) : null;
    return endT ? `${startT}–${endT}` : `${startT}`;
  }, [session.starts_at, session.ends_at]);

  return (
    <section
      style={{
        padding: 16,
        marginTop: 12,
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        background: "#fff",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {session.name}{" "}
          <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 14 }}>
            ({bookings.length}/{session.capacity})
          </span>
        </h2>

        <div style={{ opacity: 0.75, fontSize: 14, whiteSpace: "nowrap" }}>
          {timeLine ? <span>{timeLine}</span> : null}
        </div>
      </div>

      {/* Notes shown on the specific session card, in red */}
      {session.notes && (
        <p style={{ marginTop: 8, marginBottom: 0, color: "red", fontSize: 13 }}>
          {session.notes}
        </p>
      )}

      {/* Signup inputs */}
      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <div
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1fr 1fr",
            alignItems: "center",
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="Student ID (whitelist)"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
          }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (confirmation + cancel link)"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
            type="email"
          />
          <button
            onClick={addBooking}
            style={{
              padding: "10px 14px",
              border: "1px solid #ddd",
              borderRadius: 10,
              background: "#fafafa",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Add
          </button>
        </div>

        {lastCancelUrl && (
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 13 }}>
            <b>Save this link to cancel later:</b>{" "}
            <a href={lastCancelUrl} style={{ wordBreak: "break-all" }}>
              {lastCancelUrl}
            </a>
          </p>
        )}
      </div>

      {/* Lists */}
      {loading ? (
        <p style={{ marginTop: 12 }}>Loading…</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginTop: 14,
            }}
          >
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>Bookings</h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {bookings.map((b, i) => (
                  <li key={`${b}-${i}`} style={{ marginBottom: 6, fontSize: 13 }}>
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 15 }}>
                Waitlist <span style={{ opacity: 0.7, fontWeight: 400 }}>({waitlist.length})</span>
              </h3>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {waitlist.map((w, i) => (
                  <li key={`${w}-${i}`} style={{ marginBottom: 6, fontSize: 13 }}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
            To cancel your booking, use the link in your confirmation email.
          </p>
        </>
      )}
    </section>
  );

}

/* ----------------------------------------------------
   Home: loads ALL sessions and renders a SessionCard for each.
----------------------------------------------------- */
export default function Home() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .order("starts_at", { ascending: true });

      if (error) {
        console.error("Failed to load sessions:", error);
        setSessions([]);
      } else {
        setSessions((data ?? []) as SessionRow[]);
      }

      setLoading(false);
    };

    loadSessions();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, SessionRow[]>();

    for (const s of sessions) {
      if (!s.starts_at) continue;
      const key = dateKey(s.starts_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }

    // Keep keys sorted ascending
    const keys = Array.from(map.keys()).sort();
    return keys.map(k => ({ key: k, sessions: map.get(k)! }));
  }, [sessions]);

  return (
    <main style={{ padding: 20, maxWidth: 820, margin: "0 auto" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Badminton Booking (Supabase – Multiple Sessions)</h1>

        <Link href="/signin" style={{ textDecoration: "underline" }}>
          Admin sign in
        </Link>
      </div>

      {loading ? (
        <p>Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p>No sessions yet.</p>
      ) : (
        grouped.map(group => {
          const first = group.sessions[0]?.starts_at;
          return (
            <div key={group.key} style={{ marginTop: 18 }}>
              <h2 style={{ margin: 0, fontSize: 16, opacity: 0.85 }}>
                {first ? formatDateHeading(first) : group.key}
              </h2>

              <div style={{ marginTop: 8 }}>
                {group.sessions.map(sess => (
                  <SessionCard key={sess.id} session={sess} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </main>
  );
}
