"use client";

import { useState } from "react";

export default function WhitelistUploadForm({
  defaultEmailColumn,
  defaultStudentIdColumn,
}: {
  defaultEmailColumn: string;
  defaultStudentIdColumn: string;
}) {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setMessage(message);
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
        {submitting ? "Uploading..." : "Step 2: Upload membership file"}
      </button>
      <details className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Column mapping (optional)
        </summary>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Set the exact column names from your file. Values are saved for next time.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Email column name</span>
            <input
              name="membership_col_email"
              defaultValue={defaultEmailColumn}
              className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[var(--muted)]">Student ID column name</span>
            <input
              name="membership_col_student_id"
              defaultValue={defaultStudentIdColumn}
              className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </details>
      <p className="text-sm text-[var(--muted)]">
        Upload replaces the existing membership list. You can map by exact header names,
        or leave defaults and let auto-detection run.
      </p>
      {message && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
