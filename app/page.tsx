"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Minimal row types (helps TypeScript autocomplete)
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

// —— set the session you’re working with ——
const SESSION_ID = "YOUR_SESSION_UUID_HERE";

export default function Home() {
  const [name, setName] = useState("");
  const [bookings, setBookings] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState<string[]>([]);
  const [capacity, setCapacity] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch session capacity + all signups (once on mount)
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // 1) get session (capacity)
      const { data: sessionRows, error: sessionErr } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", SESSION_ID)
        .limit(1);

      if (sessionErr) {
        console.error("Failed to load session:", sessionErr);
      } else if (sessionRows && sessionRows.length > 0) {
        const session = sessionRows[0] as SessionRow;
        setCapacity(session.capacity);
      }

      // 2) get signups for this session
      const { data: signupRows, error: signupErr } = await supabase
        .from("signups")
        .select("*")
        .eq("session_id", SESSION_ID)
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
  }, []);

  // Add a signup (decides signed_up vs waiting_list based on current count)
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
      bookings.length < capacity ? "signed_up" : "waiting_list";

    const { error } = await supabase.from("signups").insert({
      session_id: SESSION_ID,
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

  // Remove from bookings; promote first waitlisted (oldest by created_at)
  const removeBooking = async (indexToRemove: number) => {
    const nameToRemove = bookings[indexToRemove];

    // Delete exact row for this session + name + status
    const { error: delErr } = await supabase
      .from("signups")
      .delete()
      .eq("session_id", SESSION_ID)
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
        .eq("session_id", SESSION_ID)
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

  // Remove from waitlist only
  const removeFromWaitlist = async (indexToRemove: number) => {
    const nameToRemove = waitlist[indexToRemove];

    const { error } = await supabase
      .from("signups")
      .delete()
      .eq("session_id", SESSION_ID)
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
    <main style={{ padding: 20, maxWidth: 560 }}>
      <h1>Badminton Booking (Supabase)</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={addBooking}>Add</button>
      </div>

      <p style={{ marginTop: 12, opacity: 0.8 }}>
        Session capacity: <b>{capacity}</b>
      </p>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <h2 style={{ marginTop: 24 }}>
            Bookings ({bookings.length}/{capacity})
          </h2>
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

          <h2 style={{ marginTop: 24 }}>Waitlist ({waitlist.length})</h2>
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
    </main>
  );
}
