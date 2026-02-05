"use client";

import { useState } from "react";

export default function WhitelistUploadForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/admin/whitelist/import", {
        method: "POST",
        body: data,
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? "Upload failed.");
      }

      setMessage("Upload complete.");
    } catch (err: any) {
      setMessage(err?.message ?? "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      action="/api/admin/whitelist/import"
      method="post"
      encType="multipart/form-data"
      className="space-y-3"
    >
      <div className="space-y-1">
        <label className="block text-sm font-medium">Step 1: Choose file</label>
        <input
          name="file"
          type="file"
          accept=".xlsx,.csv"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          className="block w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm file:mr-4 file:rounded-xl file:border file:border-[var(--line)] file:bg-[var(--chip)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--ink)] file:shadow-sm"
        />
        {fileName && <p className="text-xs opacity-70">Selected: {fileName}</p>}
      </div>
      <button
        disabled={submitting}
        className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Uploading..." : "Step 2: Upload membership list"}
      </button>
      <p className="text-sm text-[var(--muted)]">
        Upload replaces the existing membership list. Headers must include email and/or
        student_id.
      </p>
      {message && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
