"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ReviewStatus = "listed" | "needs_manual" | "ambiguous" | "added";
type ReviewEntry = { key: string; name: string; email: string | null; status: ReviewStatus };

type Props = {
  defaultNameColumn: string;
  defaultEmailColumn: string;
  defaultStudentIdColumn: string;
};

export default function WhitelistUploadForm({
  defaultNameColumn,
  defaultEmailColumn,
  defaultStudentIdColumn,
}: Props) {
  const router = useRouter();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewEntry[]>([]);
  const [idMembersProcessed, setIdMembersProcessed] = useState(0);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const [manualName, setManualName] = useState("");
  const [manualStudentId, setManualStudentId] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [selectedReviewKey, setSelectedReviewKey] = useState<string | null>(null);
  const [canCreateSeparate, setCanCreateSeparate] = useState(false);
  const [createSeparate, setCreateSeparate] = useState(false);

  async function onImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setImportMessage(null);
    setImporting(true);

    try {
      const response = await fetch("/api/admin/whitelist/import", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Upload failed.");

      const entries: ReviewEntry[] = (result.noIdReview ?? []).map(
        (entry: Omit<ReviewEntry, "key">, index: number) => ({ ...entry, key: String(index) })
      );
      setReview(entries);
      setIdMembersProcessed(result.idMembersProcessed ?? 0);
      setImportMessage(
        result.mappingSaved === false
          ? `Processed ${result.idMembersProcessed ?? 0} rows with student IDs, but the column mapping could not be saved. Check the settings table.`
          : `Processed ${result.idMembersProcessed ?? 0} rows with student IDs. Existing entries were kept; matching rows were added or updated.`
      );
      router.refresh();
    } catch (error: unknown) {
      setImportMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setImporting(false);
    }
  }

  function selectForManualAdd(entry: ReviewEntry) {
    setManualName(entry.name);
    setManualStudentId("");
    setManualEmail(entry.email ?? "");
    setSelectedReviewKey(entry.key);
    setCanCreateSeparate(entry.status === "ambiguous");
    setCreateSeparate(false);
    setManualMessage(null);
  }

  async function onManualSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setManualMessage(null);
    setManualSaving(true);
    try {
      const response = await fetch("/api/admin/whitelist/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: manualName,
          studentId: manualStudentId,
          email: manualEmail,
          createSeparate,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not save member.");

      setManualMessage(result.action === "updated" ? "Member details updated." : "Member added to the list.");
      if (selectedReviewKey !== null) {
        setReview((current) => current.map((entry) =>
          entry.key === selectedReviewKey ? { ...entry, status: "added" } : entry
        ));
      }
      setManualName("");
      setManualStudentId("");
      setManualEmail("");
      setSelectedReviewKey(null);
      setCanCreateSeparate(false);
      setCreateSeparate(false);
      router.refresh();
    } catch (error: unknown) {
      setManualMessage(error instanceof Error ? error.message : "Could not save member.");
    } finally {
      setManualSaving(false);
    }
  }

  const counts = {
    listed: review.filter((entry) => entry.status === "listed").length,
    needsManual: review.filter((entry) => entry.status === "needs_manual").length,
    ambiguous: review.filter((entry) => entry.status === "ambiguous").length,
    added: review.filter((entry) => entry.status === "added").length,
  };

  return (
    <div className="space-y-8">
      <form onSubmit={onImport} encType="multipart/form-data" className="space-y-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Import membership roster</label>
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
        <details className="rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
          <summary className="cursor-pointer text-sm font-medium">Column mapping (optional)</summary>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Map the exact headers in your file. Name and student ID are required; email is optional. These mappings are saved for next time.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Name column</span>
              <input name="membership_col_name" defaultValue={defaultNameColumn} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Student ID column</span>
              <input name="membership_col_student_id" defaultValue={defaultStudentIdColumn} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Email column (optional)</span>
              <input name="membership_col_email" defaultValue={defaultEmailColumn} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm" />
            </label>
          </div>
        </details>
        <p className="text-sm text-[var(--muted)]">
          Rows with a student ID are added or updated by ID. Rows without one are checked against existing names and shown below for review. Uploads never delete existing members.
        </p>
        <button disabled={importing} className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60">
          {importing ? "Processing roster..." : "Upload and review roster"}
        </button>
        {importMessage && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">{importMessage}</p>}
      </form>

      {review.length > 0 && (
        <section className="space-y-3 border-t border-[var(--line)] pt-6">
          <div>
            <h2 className="text-lg font-semibold">Rows without a student ID</h2>
            <p className="text-sm text-[var(--muted)]">
              {idMembersProcessed} ID-bearing rows processed. {counts.listed} names already matched; {counts.needsManual} need adding; {counts.ambiguous} need identity review; {counts.added} added manually in this review.
            </p>
          </div>
          <div className="space-y-2">
            {review.map((entry) => (
              <div key={entry.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-3 text-sm">
                <div>
                  <div className="font-medium">{entry.name}</div>
                  {entry.email && <div className="text-[var(--muted)]">{entry.email}</div>}
                  <div className="text-xs text-[var(--muted)]">
                    {entry.status === "listed" && "Already on the list by a unique name match."}
                    {entry.status === "needs_manual" && "No matching name found; add this person manually if they are a member."}
                    {entry.status === "ambiguous" && "This name is duplicated in the list or upload; verify before adding a separate entry."}
                    {entry.status === "added" && "Reviewed and added or updated manually."}
                  </div>
                </div>
                {(entry.status === "needs_manual" || entry.status === "ambiguous") && (
                  <button type="button" onClick={() => selectForManualAdd(entry)} className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--chip)]">
                    {entry.status === "ambiguous" ? "Review as separate member" : "Add manually"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={onManualSubmit} className="space-y-3 border-t border-[var(--line)] pt-6">
        <div>
          <h2 className="text-lg font-semibold">Add or update a member manually</h2>
          <p className="text-sm text-[var(--muted)]">
            Name is required. Student ID and email can be added now or later. A record without either ID or email is for admin tracking only and cannot authorize booking yet.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            Name
            <input required maxLength={160} value={manualName} onChange={(e) => setManualName(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" />
          </label>
          <label className="block text-sm">
            Student ID (optional)
            <input value={manualStudentId} onChange={(e) => setManualStudentId(e.target.value)} placeholder="s1234567" className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" />
          </label>
          <label className="block text-sm">
            Email (optional)
            <input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" />
          </label>
        </div>
        {canCreateSeparate && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={createSeparate} onChange={(e) => setCreateSeparate(e.target.checked)} className="mt-1" />
            Add as a separate person despite the matching name
          </label>
        )}
        {createSeparate && (
          <p className="text-sm text-amber-700">This will create a separate member record despite the duplicate name. Confirm the person is distinct before saving.</p>
        )}
        <button disabled={manualSaving} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {manualSaving ? "Saving..." : selectedReviewKey !== null ? "Save reviewed member" : "Add / update member"}
        </button>
        {manualMessage && <p role="status" className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">{manualMessage}</p>}
      </form>
    </div>
  );
}
