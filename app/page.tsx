"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

// Minimal row types (helps TypeScript autocomplete)
// oh so these are predefined types for error checking whilst coding
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
  notes: string | null;
  created_at: string;
};

/* ---------------------------------------------
   SessionCard: encapsulates the entire logic for ONE session.
   We pass the session's id, name, and capacity in as props.
   This keeps state + realtime subscription scoped per session.
------------------------------------------------ */
function SessionCard({ session }: { session: SessionRow }) {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState(""); // NEW: capture student_id (whitelist-enforced)
  const [email, setEmail] = useState("");         // NEW: capture email (used for confirmation)
  const [bookings, setBookings] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastCancelUrl, setLastCancelUrl] = useState<string | null>(null); // NEW: show cancel URL after insert (until email is wired)

  // -------------------------------------------
  // Fetch all signups for this session (once on mount)
  // this function is ran on browser load once. useEffect(() => {},[])
  // a mount means loading for the first time.
  // -------------------------------------------
  useEffect(() => {
    // async means that the code is not run line by line, like synchronous,
    // it needs to wait for network/disk/timers. await pauses inside async.
    const load = async () => {
      setLoading(true);

      // get signups for THIS session only
      const { data: signupRows, error: signupErr } = await supabase
        .from("signups")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true }); // oldest first → correct waitlist order

      if (signupErr) {
        console.error("Failed to load signups:", signupErr);
      } else if (signupRows) {
        // split into bookings + waitlist based on status
        const rows = signupRows as SignupRow[];
        setBookings(rows.filter(r => r.status === "signed_up").map(r => r.name));
        setWaitlist(rows.filter(r => r.status === "waiting_list").map(r => r.name));
      }

      setLoading(false);
    };

    load();

    // the empty array means this should only be run once when component mounts
  }, [session.id]);

  // -------------------------------------------
  // NEW: REALTIME SUBSCRIPTION for THIS session only
  // Whenever ANY insert/update/delete happens for this session's signups,
  // we refetch the signups and update the UI instantly.
  // -------------------------------------------
  useEffect(() => {
    // subscribe to database changes for THIS session only
    const channel = supabase
      .channel(`signups-realtime-${session.id}`) // channel name is arbitrary; we include session.id just to make it unique
      .on(
        "postgres_changes",        // event type = DB change
        {
          event: "*",              // listen for all events (INSERT/UPDATE/DELETE)
          schema: "public",
          table: "signups",
          filter: `session_id=eq.${session.id}`, // only this session's rows
        },
        async () => {
          // everytime a change happens → refetch and update UI
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

    // cleanup: when component unmounts or session changes, unsubscribe
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id]);
  // end of realtime useEffect

  function sbMsg(err: unknown) {
    // supabase-js v2 PostgrestError usually has message/details/hint/code
    const e = err as { message?: string; details?: string; hint?: string; code?: string } | null;
    return (
      e?.message ??
      e?.details ??
      e?.hint ??
      e?.code ??
      // fallbacks for non-enumerable objects in Next dev overlay
      (typeof err === "object" ? String((err as any)) : String(err))
    );
  }

    // -------------------------------------------
  // Add a signup via SERVER RPC (single source of truth):
  // - NO local status calculation
  // - Read r_status and r_cancel_token from RPC (array result)
  // -------------------------------------------
  const addBooking = async () => {
    const trimmed = name.trim();
    const sid = studentId.trim();
    const mail = email.trim();

    if (!trimmed) { alert("Enter your name!"); return; }
    if (!sid)     { alert("Enter your student ID (must be on whitelist)."); return; }
    if (!mail || !mail.includes("@")) { alert("Enter a valid email."); return; }

    // Optional client-side duplicate guard (DB has unique index)
    if (bookings.includes(trimmed) || waitlist.includes(trimmed)) {
      alert("This name is already registered.");
      return;
    }

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
        if (raw.includes("weekly limit"))      alert("You’ve reached the weekly limit for this week.");
        else if (raw.includes("whitelisted"))  alert("Signup blocked: your student ID is not on the whitelist.");
        else if (raw.includes("duplicate") || raw.includes("unique")) alert("Duplicate signup detected for this session.");
        else if (raw.includes("session not found")) alert("This session no longer exists.");
        else alert(`Could not add signup. (${raw || "unknown error"})`);
        return;
      }

      console.debug("RPC data:", data)

      const row = Array.isArray(data) ? data[0] : data;

      if (row?.r_status === "signed_up") {
        setBookings(prev => [...prev, trimmed]);
      } else if (row?.r_status === "waiting_list") {
        setWaitlist(prev => [...prev, trimmed]);
        alert("Session full – added to waitlist.");
      } else {
        // Fallback: refetch from DB and infer (shouldn't happen with RETURN QUERY)
        const { data: fresh } = await supabase
          .from("signups")
          .select("name,status")
          .eq("session_id", session.id)
          .order("created_at", { ascending: true });
        const names = (fresh ?? []) as { name: string; status: "signed_up" | "waiting_list" }[];
        const me = names.find(n => n.name === trimmed);
        if (me?.status === "signed_up") setBookings(prev => [...prev, trimmed]);
        else { setWaitlist(prev => [...prev, trimmed]); alert("Session full – added to waitlist."); }
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



  // -------------------------------------------
  // Remove buttons (user-side) are disabled now.
  // RLS denies delete/update for public users; cancellation uses token link instead.
  // Keeping functions below for future admin UI or if you temporarily re-enable.
  // -------------------------------------------

  // Remove from bookings; promote first waitlisted (oldest by created_at)
  const removeBooking = async (_indexToRemove: number) => {
    alert("Users cannot remove directly. Use the cancellation link from your confirmation email.");
    return;
  };

  // Remove from waitlist only
  const removeFromWaitlist = async (_indexToRemove: number) => {
    alert("Users cannot remove directly. Use the cancellation link from your confirmation email.");
    return;
  };

  return (
    <section style={{ padding: 16, marginTop: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>
        {session.name}{" "}
        <span style={{ opacity: 0.7, fontWeight: 400 }}>
          ({bookings.length}/{session.capacity})
        </span>
      </h2>
      {/* optional: show starts_at if you use it */}
      {session.starts_at && (
        <p style={{ marginTop: 4, opacity: 0.8 }}>
          Starts: {new Date(session.starts_at).toLocaleString()}
        </p>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={{ padding: 8 }}
        />
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          placeholder="Enter your student ID (must be on whitelist)"
          style={{ padding: 8 }}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email (for confirmation + cancel link)"
          style={{ padding: 8 }}
          type="email"
        />
        <button onClick={addBooking}>Add</button>

        {/* NEW: show cancel link after a successful insert (temporary) */}
        {lastCancelUrl && (
          <p style={{ marginTop: 6 }}>
            <b>Save this link to cancel later:</b>{" "}
            <a href={lastCancelUrl}>{lastCancelUrl}</a>
          </p>
        )}
      </div>

      {loading ? (
        <p style={{ marginTop: 12 }}>Loading…</p>
      ) : (
        <>
          <h3 style={{ marginTop: 16 }}>Bookings</h3>
          <ul>
            {bookings.map((b, i) => (
              <li key={`${b}-${i}`} style={{ marginBottom: 6 }}>
                {b}{" "}
                {/* Buttons disabled for users; left in place for future admin UI */}
                <button onClick={() => removeBooking(i)} style={{ marginLeft: 8 }}>
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <h3 style={{ marginTop: 16 }}>Waitlist ({waitlist.length})</h3>
          <ul>
            {waitlist.map((w, i) => (
              <li key={`${w}-${i}`} style={{ marginBottom: 6 }}>
                {w}{" "}
                <button
                  onClick={() => removeFromWaitlist(i)}
                  style={{ marginLeft: 8 }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <p style={{ marginTop: 10, opacity: 0.8 }}>
            To cancel your booking, use the link in your confirmation email.
          </p>
        </>
      )}
    </section>
  );
}

/* ----------------------------------------------------
   Home: loads ALL sessions and renders a SessionCard for each.
   Eventually, admins will create/modify sessions here.
----------------------------------------------------- */
export default function Home() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch sessions list on mount
  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);

      // get all sessions; you can order by starts_at or created_at
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
  }, []); // run once when page mounts

  return (
    <main style={{ padding: 20, maxWidth: 780, margin: "0 auto" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1>Badminton Booking (Supabase – Multiple Sessions)</h1>

        <Link href="/signin">Admin sign in</Link>
      </div>

      {loading ? (
        <p>Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p>No sessions yet.</p>
      ) : (
        sessions.map(sess => (
          <SessionCard key={sess.id} session={sess} />
        ))
      )}
    </main>
  );
}
