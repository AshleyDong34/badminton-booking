"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CancelStatus = "ready" | "submitting" | "ok" | "invalid" | "error";

export default function CancelBookingClient({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<CancelStatus>(token ? "ready" : "invalid");
  const [msg, setMsg] = useState<string>(token ? "" : "Missing token in URL.");
  const [redirectIn, setRedirectIn] = useState<number | null>(null);

  const cancelBooking = async () => {
    if (!token || status === "submitting") return;

    setStatus("submitting");
    setMsg("");

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
      setRedirectIn(6);
    } else {
      setStatus("invalid");
      setMsg("This link is invalid or already used.");
    }
  };

  useEffect(() => {
    if (status !== "ok") return;

    const countdownTimer = setInterval(() => {
      setRedirectIn((current) => {
        if (current === null || current <= 1) return null;
        return current - 1;
      });
    }, 1000);

    const redirectTimer = setTimeout(() => {
      router.push("/");
    }, 6000);

    return () => {
      clearInterval(countdownTimer);
      clearTimeout(redirectTimer);
    };
  }, [status, router]);

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Cancel Booking</h1>
      {status === "ready" && (
        <>
          <p style={{ marginTop: 12 }}>
            Click the button below to cancel your booking.
          </p>
          <button
            type="button"
            onClick={cancelBooking}
            style={{
              marginTop: 16,
              padding: "10px 16px",
              border: "none",
              borderRadius: 6,
              background: "#111827",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Cancel booking
          </button>
        </>
      )}
      {status === "submitting" && (
        <p style={{ marginTop: 12 }}>Cancelling your booking...</p>
      )}
      {status !== "ready" && status !== "submitting" && (
        <p style={{ marginTop: 12 }}>{msg}</p>
      )}
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

