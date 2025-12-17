import Link from "next/link";

// Replace with DB call
async function getSessions() {
  return [
    { id: "s1", start: "2025-01-10T18:00:00Z", end: "2025-01-10T20:00:00Z", capacity: 48, booked: 42, waitlist: 6, status: "open" },
    { id: "s2", start: "2025-01-12T14:00:00Z", end: "2025-01-12T16:00:00Z", capacity: 64, booked: 64, waitlist: 12, status: "closed" },
  ];
}

export default async function SessionsPage() {
  const sessions = await getSessions();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <Link href="/admin/sessions/new" className="border rounded-xl px-3 py-2">New session</Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Start</th>
              <th className="py-2 pr-4">End</th>
              <th className="py-2 pr-4">Cap</th>
              <th className="py-2 pr-4">Booked</th>
              <th className="py-2 pr-4">Waitlist</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2 pr-4">{new Date(s.start).toLocaleString()}</td>
                <td className="py-2 pr-4">{new Date(s.end).toLocaleString()}</td>
                <td className="py-2 pr-4">{s.capacity}</td>
                <td className="py-2 pr-4">{s.booked}</td>
                <td className="py-2 pr-4">{s.waitlist}</td>
                <td className="py-2 pr-4">{s.status}</td>
                <td className="py-2 pr-4 space-x-2">
                  <Link className="underline" href={`/admin/sessions/${s.id}`}>Manage</Link>
                  <button className="underline" formAction={`/admin/sessions/${s.id}/actions/close`}>Close</button>
                  <button className="underline" formAction={`/admin/sessions/${s.id}/actions/delete`}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}