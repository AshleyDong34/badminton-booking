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
      <button className="underline" type="submit">
        Remove
      </button>
    </form>
  );
}
