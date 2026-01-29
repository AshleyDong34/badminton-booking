"use client";

type RemoveAdminFormProps = {
  userId: string;
};

export default function RemoveAdminForm({ userId }: RemoveAdminFormProps) {
  return (
    <form
      action="/api/admin/admins/remove"
      method="post"
      onSubmit={(e) => {
        if (!confirm("Remove this admin? They will lose access immediately.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button
        className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted)] shadow-sm transition hover:translate-y-[-1px]"
        type="submit"
      >
        Remove
      </button>
    </form>
  );
}
