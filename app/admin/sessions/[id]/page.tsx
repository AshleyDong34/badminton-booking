import Link from "next/link";

type Booking = { id: string; name: string; email: string };

async function getSession(id: string) {
  return {
    id,
    start: "2025-01-10T18:00:00Z",
    end: "2025-01-10T20:00:00Z",
    capacity: 48,
    booked: [{ id: "b1", name: "Alice", email: "alice@ex.com" } as Booking],
    waitlist: [{ id: "w1", name: "Bob", email: "bob@ex.com" } as Booking],
    status: "open" as const,
  };
}

// params here means that next calls the function with a parameter, as it is in a folder with [id], this params will have a 
// property including .id
export default async function SessionDetail({ params }: { params: { id: string } }) {
  const s = await getSession(params.id);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Session {s.id}</h1>
        <Link className="underline" href="/admin/sessions">Back</Link>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm opacity-70">Start</div>
          <div>{new Date(s.start).toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm opacity-70">End</div>
          <div>{new Date(s.end).toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm opacity-70">Capacity</div>
          <div>{s.capacity}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="font-medium mb-2">Booked</h2>
          <ul className="divide-y border rounded-2xl">
            {s.booked.map((b) => (
              <li key={b.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-sm opacity-70">{b.email}</div>
                </div>
                <form action={`/api/admin/sessions/${s.id}/promote`} method="post">
                  <input type="hidden" name="bookingId" value={b.id} />
                  <button className="underline">Move to waitlist</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-medium mb-2">Waitlist</h2>
          <ul className="divide-y border rounded-2xl">
            {s.waitlist.map((w) => (
              <li key={w.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{w.name}</div>
                  <div className="text-sm opacity-70">{w.email}</div>
                </div>
                <form action={`/api/admin/sessions/${s.id}/promote`} method="post">
                  <input type="hidden" name="waitId" value={w.id} />
                  <button className="underline">Promote to booked</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}