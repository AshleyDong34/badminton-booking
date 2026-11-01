"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ClearMembershipForm({ count }: { count: number | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function clearMembership() {
    if (count === null || count < 1 || typedConfirmation !== "CLEAR MEMBERSHIP" || clearing) return;
    setClearing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/whitelist/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCount: count, confirmation: typedConfirmation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not clear the membership list.");
      setMessage(`${result.removed} membership ${result.removed === 1 ? "entry" : "entries"} cleared.`);
      setTypedConfirmation("");
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear the membership list.");
      router.refresh();
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-3">
      <h2 className="text-lg font-semibold text-red-950">Reset membership</h2>
      <p className="text-sm text-red-900">
        Clear {count ?? "all"} current members, including full-year members. Existing bookings and free-taster history stay in place.
      </p>
      {!confirming ? (
        <button
          type="button"
          disabled={count === null || count === 0}
          onClick={() => { setMessage(null); setError(null); setConfirming(true); }}
          className="rounded-xl border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear membership list
        </button>
      ) : (
        <div className="rounded-xl border border-red-300 bg-white p-4 space-y-3">
          <p className="text-sm font-semibold text-red-950">Are you sure you want to remove every current member?</p>
          <label className="block text-sm text-red-900" htmlFor="clear-membership-confirmation">
            Type <strong>CLEAR MEMBERSHIP</strong> to confirm.
          </label>
          <input
            id="clear-membership-confirmation"
            value={typedConfirmation}
            onChange={(event) => setTypedConfirmation(event.target.value)}
            autoComplete="off"
            className="block w-full max-w-xs rounded-lg border border-red-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={typedConfirmation !== "CLEAR MEMBERSHIP" || clearing}
              onClick={clearMembership}
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Yes, clear all members"}
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => { setTypedConfirmation(""); setConfirming(false); }}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p role="status" className="text-sm text-green-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
