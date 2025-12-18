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

export default async function SessionDetail({
  params,
}: {
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
        <p className="text-sm opacity-80">
          id from URL: <code>{String(sessionId)}</code>
        </p>
        {sessionError && (
          <p className="text-sm opacity-80">DB error: {sessionError.message}</p>
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
        <p className="text-sm opacity-80">
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{s.name}</h1>
          <div className="text-sm opacity-70">
            Signed up: {signedUp.length}/{s.capacity}{" "}
            {isFull ? "• FULL" : "• Spaces available"} • Waiting list:{" "}
            {waitingList.length}
          </div>
        </div>
        <Link className="underline" href="/admin/sessions">
          Back
        </Link>
      </div>

      {/* Two columns: Signed up + Waiting list */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Signed up list */}
        <section className="space-y-2">
          <h2 className="font-medium">Signed up</h2>

          <ul className="divide-y border rounded-2xl">
            {signedUp.length === 0 ? (
              <li className="p-3 opacity-70">No one signed up yet.</li>
            ) : (
              signedUp.map((person) => (
                <li
                  key={person.id}
                  className="p-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">{person.name}</div>
                    <div className="text-sm opacity-70">{person.email}</div>
                    <div className="text-xs opacity-60">
                      Joined: {new Date(person.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Move to waiting list */}
                    <form action={`/api/admin/sessions/${s.id}/move`} method="post">
                      <input type="hidden" name="signupId" value={person.id} />
                      <input type="hidden" name="toStatus" value="waiting_list" />
                      <button className="underline">Move to waitlist</button>
                    </form>

                    {/* Remove with confirmation (native, no JS) */}
                    <details className="inline-block">
                      <summary className="underline cursor-pointer select-none">
                        Remove
                      </summary>
                      <div className="mt-2 flex items-center gap-2">
                        <form action={`/api/admin/sessions/${s.id}/remove`} method="post">
                          <input type="hidden" name="signupId" value={person.id} />
                          <button className="border rounded-lg px-2 py-1">
                            Confirm remove
                          </button>
                        </form>
                        <span className="text-sm opacity-70">Click outside to cancel</span>
                      </div>
                    </details>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Waiting list */}
        <section className="space-y-2">
          <h2 className="font-medium">Waiting list</h2>

          <ul className="divide-y border rounded-2xl">
            {waitingList.length === 0 ? (
              <li className="p-3 opacity-70">No one on the waiting list.</li>
            ) : (
              waitingList.map((person) => (
                <li
                  key={person.id}
                  className="p-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">{person.name}</div>
                    <div className="text-sm opacity-70">{person.email}</div>
                    <div className="text-xs opacity-60">
                      Joined: {new Date(person.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Promote to signed up */}
                    <form action={`/api/admin/sessions/${s.id}/move`} method="post">
                      <input type="hidden" name="signupId" value={person.id} />
                      <input type="hidden" name="toStatus" value="signed_up" />
                      <button className="underline">Promote to signed up</button>
                    </form>

                    {/* Remove with confirmation */}
                    <details className="inline-block">
                      <summary className="underline cursor-pointer select-none">
                        Remove
                      </summary>
                      <div className="mt-2 flex items-center gap-2">
                        <form action={`/api/admin/sessions/${s.id}/remove`} method="post">
                          <input type="hidden" name="signupId" value={person.id} />
                          <button className="border rounded-lg px-2 py-1">
                            Confirm remove
                          </button>
                        </form>
                        <span className="text-sm opacity-70">Click outside to cancel</span>
                      </div>
                    </details>
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
