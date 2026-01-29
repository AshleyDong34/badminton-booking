"use client";

export default function DeleteSessionButton({ id }: { id: string }) {
  return (
    <form
      action={`/api/admin/sessions/${id}/delete`}
      method="post"
      className="inline"
      onSubmit={(e) => {
        const ok = window.confirm(
          "Delete this session?\n\nThis will also delete all signups/waitlist entries for it."
        );
        if (!ok) e.preventDefault();
      }}
    >
      <button
        className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm transition hover:translate-y-[-1px]"
        type="submit"
      >
        Delete
      </button>
    </form>
  );
}
