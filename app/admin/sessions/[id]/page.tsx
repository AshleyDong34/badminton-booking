import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

// Always fetch fresh data for admin pages (no caching).
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionDetailProps = {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

type SessionRow = {
  id: string;
  name: string;
  capacity: number;
};

type SignupRow = {
  id: string;
  name: string;
  email: string;
  status: "signed_up" | "waiting_list";
  created_at: string; // you confirmed this exists
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SessionDetail({
  params,
  searchParams,
}: SessionDetailProps) {
  const supabase = supabaseServer();

  // Safest way: works whether params is sync or async.
  const { id: sessionId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const capacityStatus = firstSearchValue(resolvedSearchParams.capacityStatus);
  const capacityMessage = firstSearchValue(resolvedSearchParams.capacityMessage);
  const errorCode = firstSearchValue(resolvedSearchParams.error);

  // 1) Load the session itself
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id,name,capacity")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Session not found</h1>
        <p className="text-sm text-[var(--muted)]">
          id from URL: <code>{String(sessionId)}</code>
        </p>
        {sessionError && (
          <p className="text-sm text-[var(--muted)]">DB error: {sessionError.message}</p>
        )}
        <Link className="underline" href="/admin/sessions">
          Back
        </Link>
      </div>
    );
  }

  const s = session as SessionRow;

  // 2) Load all signups for this session (we will split by status in code)
  const { data: signups, error: signupsError } = await supabase
    .from("signups")
    .select("id,name,email,status,created_at")
    .eq("session_id", sessionId)
    .order("name", { ascending: true });

  if (signupsError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Session {s.name}</h1>
        <p className="text-sm text-[var(--muted)]">
          Failed to load signups: {signupsError.message}
        </p>
        <Link className="underline" href="/admin/sessions">
          Back
        </Link>
      </div>
    );
  }

  const rows = (signups ?? []) as SignupRow[];

  // 3) Split into booked and waitlist based on your enum values
  const signedUp = rows.filter((r) => r.status === "signed_up");
  const waitingList = rows.filter((r) => r.status === "waiting_list");

  const isFull = signedUp.length >= s.capacity;
  const minCapacity = Math.max(1, signedUp.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{s.name}</h1>
          <div className="text-sm text-[var(--muted)]">
            Signed up: {signedUp.length}/{s.capacity} | {isFull ? "Full" : "Spaces available"} | Waiting list: {waitingList.length}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
            href={`/admin/sessions/${s.id}/attendance`}
          >
            Attendance
          </Link>
          <Link
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
            href="/admin/sessions"
          >
            Back
          </Link>
        </div>
      </div>

      {(capacityMessage || errorCode === "full") && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium shadow-sm ${
            capacityStatus === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {capacityMessage ||
            "This session is full. Increase the capacity before promoting someone."}
        </div>
      )}

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Session controls
              </p>
              <h2 className="mt-1 text-lg font-semibold">Capacity</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                Increase the capacity to open extra spaces. If people are on the
                waitlist, the earliest waitlisted players will be promoted
                automatically and sent an email.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs font-semibold text-[var(--muted)]">Booked</p>
                <p className="mt-1 text-2xl font-bold">{signedUp.length}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs font-semibold text-[var(--muted)]">Capacity</p>
                <p className="mt-1 text-2xl font-bold">{s.capacity}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-xs font-semibold text-[var(--muted)]">Waitlist</p>
                <p className="mt-1 text-2xl font-bold">{waitingList.length}</p>
              </div>
            </div>
          </div>

          <form
            action={`/api/admin/sessions/${s.id}/capacity`}
            method="post"
            className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm"
          >
            <label className="block text-sm font-semibold">
              Set session capacity
              <input
                name="capacity"
                type="number"
                min={minCapacity}
                defaultValue={s.capacity}
                required
                className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3 text-lg font-bold"
              />
            </label>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Minimum allowed: {minCapacity}, because {signedUp.length}{" "}
              {signedUp.length === 1 ? "person is" : "people are"} already
              booked.
            </p>
            <button className="mt-4 w-full rounded-xl bg-[var(--ok)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5">
              Save capacity
            </button>
          </form>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Signed up</h2>
            <span className="text-xs text-[var(--muted)]">{signedUp.length} people</span>
          </div>

          <ul className="mt-3 divide-y divide-[var(--line)]">
            {signedUp.length === 0 ? (
              <li className="p-3 text-sm text-[var(--muted)]">No one signed up yet.</li>
            ) : (
              signedUp.map((person) => (
                <li key={person.id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{person.name}</div>
                      <div className="text-sm text-[var(--muted)]">{person.email}</div>
                      <div className="text-xs text-[var(--muted)]">
                        Joined: {new Date(person.created_at).toLocaleString("en-GB")}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={`/api/admin/sessions/${s.id}/move`} method="post">
                        <input type="hidden" name="signupId" value={person.id} />
                        <input type="hidden" name="toStatus" value="waiting_list" />
                        <button className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                          Move to waitlist
                        </button>
                      </form>

                      <details className="relative">
                        <summary className="cursor-pointer rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                          Remove
                        </summary>
                        <div className="mt-2 flex items-center gap-2">
                          <form action={`/api/admin/sessions/${s.id}/remove`} method="post">
                            <input type="hidden" name="signupId" value={person.id} />
                            <button className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs">
                              Confirm remove
                            </button>
                          </form>
                          <span className="text-xs text-[var(--muted)]">
                            Click outside to cancel
                          </span>
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Waiting list</h2>
            <span className="text-xs text-[var(--muted)]">{waitingList.length} people</span>
          </div>

          <ul className="mt-3 divide-y divide-[var(--line)]">
            {waitingList.length === 0 ? (
              <li className="p-3 text-sm text-[var(--muted)]">No one on the waiting list.</li>
            ) : (
              waitingList.map((person) => (
                <li key={person.id} className="p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{person.name}</div>
                      <div className="text-sm text-[var(--muted)]">{person.email}</div>
                      <div className="text-xs text-[var(--muted)]">
                        Joined: {new Date(person.created_at).toLocaleString("en-GB")}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={`/api/admin/sessions/${s.id}/move`} method="post">
                        <input type="hidden" name="signupId" value={person.id} />
                        <input type="hidden" name="toStatus" value="signed_up" />
                        <button className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                          Promote to signed up
                        </button>
                      </form>

                      <details className="relative">
                        <summary className="cursor-pointer rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                          Remove
                        </summary>
                        <div className="mt-2 flex items-center gap-2">
                          <form action={`/api/admin/sessions/${s.id}/remove`} method="post">
                            <input type="hidden" name="signupId" value={person.id} />
                            <button className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-xs">
                              Confirm remove
                            </button>
                          </form>
                          <span className="text-xs text-[var(--muted)]">
                            Click outside to cancel
                          </span>
                        </div>
                      </details>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
