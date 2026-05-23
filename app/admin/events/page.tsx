import { supabaseServer } from "@/lib/supabase-server";
import EventImageInput from "./EventImageInput";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EventRow = {
  id: string;
  title: string;
  body: string | null;
  link_label: string | null;
  link_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_side: "left" | "right" | null;
  expires_on: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
};

type EventsPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function EventFields({ event }: { event?: EventRow }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium">Title</label>
        <input
          name="title"
          type="text"
          required
          defaultValue={event?.title ?? ""}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          placeholder="Club dinner, charity tournament, kit order..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Description</label>
        <textarea
          name="body"
          rows={4}
          defaultValue={event?.body ?? ""}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm"
          placeholder="Short event details to show on the public homepage."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Button text</label>
          <input
            name="link_label"
            type="text"
            defaultValue={event?.link_label ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Button link</label>
          <input
            name="link_url"
            type="url"
            defaultValue={event?.link_url ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            placeholder="https://..."
          />
        </div>
      </div>

      <EventImageInput
        defaultUrl={event?.image_url}
        defaultAlt={event?.image_alt}
        showRemoveOption={Boolean(event)}
      />

      <div className="grid gap-3 md:grid-cols-3 md:items-end">
        <div>
          <label className="block text-sm font-medium">Display order</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={event?.sort_order ?? 0}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Lower numbers appear first.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium">Hide after date</label>
          <input
            name="expires_on"
            type="date"
            defaultValue={event?.expires_on ?? ""}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Leave empty to keep it visible until hidden or deleted.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
          <label className="block text-sm font-medium">
            Image side
            <select
              name="image_side"
              defaultValue={event?.image_side ?? "right"}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            >
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={event?.is_active ?? true}
              className="h-4 w-4"
            />
            Show on public site
          </label>
        </div>
      </div>
    </>
  );
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const params = searchParams ? await searchParams : {};
  const eventStatus = firstSearchValue(params.eventStatus);
  const eventMessage = firstSearchValue(params.eventMessage);
  const isSuccessMessage = eventStatus === "success";

  const db = supabaseServer();
  const { data, error } = await db
    .from("events")
    .select(
      "id,title,body,link_label,link_url,image_url,image_alt,image_side,expires_on,is_active,sort_order,created_at"
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const events = (data ?? []) as EventRow[];

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-sm text-[var(--muted)]">
          Add event cards to the public homepage banner.
        </p>
      </div>

      {eventMessage && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium shadow-sm ${
            isSuccessMessage
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {eventMessage}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
          Failed to load events: {error.message}
        </div>
      )}

      <form
        action="/api/admin/events"
        method="post"
        encType="multipart/form-data"
        className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">New event</h2>
        <EventFields />
        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Add event
        </button>
      </form>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Current events</h2>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
            No events posted yet.
          </div>
        ) : (
          events.map((event) => (
            <form
              key={event.id}
              action={`/api/admin/events/${event.id}`}
              method="post"
              encType="multipart/form-data"
              className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{event.title}</h3>
                  <p className="text-xs text-[var(--muted)]">
                    {event.is_active ? "Visible" : "Hidden"}
                  </p>
                </div>
                <button
                  name="intent"
                  value="delete"
                  formNoValidate
                  className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm"
                >
                  Delete
                </button>
              </div>
              <EventFields event={event} />
              <button
                name="intent"
                value="save"
                className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                Save changes
              </button>
            </form>
          ))
        )}
      </div>
    </div>
  );
}
