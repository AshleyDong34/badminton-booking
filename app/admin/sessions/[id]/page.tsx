import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

// Always fetch fresh data for admin pages (no caching).
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function SessionDetail({params,}: {
  // In some Next.js setups params can behave like a Promise, so we accept both.
  params: { id: string } | Promise<{ id: string }>;
}) {
  const supabase = supabaseServer();

  // Safest way: works whether params is sync or async.
  const { id: sessionId } = await params;

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
    .order("created_at", { ascending: true });

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
