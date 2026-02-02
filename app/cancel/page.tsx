"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "ok" | "invalid" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  // runs once after mount, reads ?token=... and calls RPC
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

      const res = await fetch("/api/public/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(json);
        setStatus("error");
        setMsg("Something went wrong while cancelling. Please try again later.");
        return;
      }

      if (json.status === "ok") {
        setStatus("ok");
        setMsg("Your booking has been cancelled.");
      } else {
        setStatus("invalid");
        setMsg("This link is invalid or already used.");
      }
    };

    run();
  }, []); // run once after mount

  useEffect(() => {
    if (status !== "ok") return;
    setRedirectIn(6);

    const timer = setInterval(() => {
      setRedirectIn((current) => {
        if (current === null) return null;
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, router]);

  useEffect(() => {
    if (redirectIn === null) return;
    if (redirectIn <= 0) {
      router.push("/");
      setRedirectIn(null);
    }
  }, [redirectIn, router]);

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Cancel Booking</h1>
      <p style={{ marginTop: 12 }}>{msg || "Processing your cancellation..."}</p>
      {status === "ok" && (
        <>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            If the session was full, the next person on the waitlist has been promoted automatically.
          </p>
          {redirectIn !== null && (
            <p style={{ marginTop: 8, opacity: 0.7 }}>
              Returning to the homepage in {redirectIn}s.
            </p>
          )}
        </>
      )}
    </main>
  );
}
