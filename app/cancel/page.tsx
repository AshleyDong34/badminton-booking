"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function CancelPage() {
  const [status, setStatus] = useState<"idle" | "ok" | "invalid" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  // runs once after mount – reads ?token=... and calls RPC
  useEffect(() => {
    const run = async () => {
      // read the token from the URL
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("invalid");
        setMsg("Missing token in URL.");
        return;
      }

      // call the server-side function you created (SECURITY DEFINER)
      const { data, error } = await supabase.rpc("cancel_signup_by_token", {
        p_token: token,
      });

      if (error) {
        console.error(error);
        setStatus("error");
        setMsg("Something went wrong while cancelling. Please try again later.");
        return;
      }

      // function returns true if a row was deleted, false otherwise
      if (data === true) {
        setStatus("ok");
        setMsg("Your booking has been cancelled.");
      } else {
        setStatus("invalid");
        setMsg("This link is invalid or already used.");
      }
    };

    run();
  }, []); // run once after mount

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Cancel Booking</h1>
      <p style={{ marginTop: 12 }}>
        {msg || "Processing your cancellation…"}
      </p>
      {status === "ok" && (
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          If the session was full, the next person on the waitlist has been promoted automatically.
        </p>
      )}
    </main>
  );
}
