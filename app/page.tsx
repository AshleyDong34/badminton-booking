"use client";

import { useEffect, useState } from "react";
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
  const [bookings, setBookings] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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


  // -------------------------------------------
  // Add a signup (decides signed_up vs waiting_list based on current count)
  // -------------------------------------------
  const addBooking = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      alert("Enter a name!");
      return;
    }
    if (bookings.includes(trimmed) || waitlist.includes(trimmed)) {
      alert("This name is already registered.");
      return;
    }

    const status: SignupRow["status"] =
      bookings.length < session.capacity ? "signed_up" : "waiting_list";

    const { error } = await supabase.from("signups").insert({
      session_id: session.id,
      name: trimmed,
      status
    });

    if (error) {
      alert("Could not add signup.");
      console.error(error);
      return;
    }

    // Optimistic UI update (instant feedback)
    if (status === "signed_up") setBookings(prev => [...prev, trimmed]);
    else {
      setWaitlist(prev => [...prev, trimmed]);
      alert("Session full – added to waitlist.");
    }

    setName("");
  };

  // -------------------------------------------
  // Remove from bookings; promote first waitlisted (oldest by created_at)
  // -------------------------------------------
  const removeBooking = async (indexToRemove: number) => {
    const nameToRemove = bookings[indexToRemove];

    // Delete exact row for this session + name + status
    const { error: delErr } = await supabase
      .from("signups")
      .delete()
      .eq("session_id", session.id)
      .eq("name", nameToRemove)
      .eq("status", "signed_up");

    if (delErr) {
      alert("Could not remove booking.");
      console.error(delErr);
      return;
    }

    const updatedBookings = bookings.filter((_, i) => i !== indexToRemove);

    // Promote first person in waitlist (if any)
    if (waitlist.length > 0) {
      const [first, ...rest] = waitlist;

      const { error: upErr } = await supabase
        .from("signups")
        .update({ status: "signed_up" })
        .eq("session_id", session.id)
        .eq("name", first)
        .eq("status", "waiting_list");

      if (upErr) {
        // If promotion fails, just reflect the deletion
        console.error("Promotion failed:", upErr);
        setBookings(updatedBookings);
        return;
      }

      setBookings([...updatedBookings, first]);
      setWaitlist(rest);
    } else {
      setBookings(updatedBookings);
    }
  };

  // -------------------------------------------
  // Remove from waitlist only
  // -------------------------------------------
  const removeFromWaitlist = async (indexToRemove: number) => {
    const nameToRemove = waitlist[indexToRemove];

    const { error } = await supabase
      .from("signups")
      .delete()
      .eq("session_id", session.id)
      .eq("name", nameToRemove)
      .eq("status", "waiting_list");

    if (error) {
      alert("Could not remove from waitlist.");
      console.error(error);
      return;
    }

    setWaitlist(waitlist.filter((_, i) => i !== indexToRemove));
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

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={addBooking}>Add</button>
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
      <h1>Badminton Booking (Supabase – Multiple Sessions)</h1>

      {loading ? (
        <p>Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p>No sessions yet.</p>
      ) : (
        sessions.map(sess => <SessionCard key={sess.id} session={sess} />)
      )}
    </main>
  );
}
