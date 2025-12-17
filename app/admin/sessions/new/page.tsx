export default function NewSessionPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Create session</h1>
      <form action="/api/admin/sessions" method="post" className="space-y-4">
        <div>
          <label className="block text-sm">Start</label>
          <input name="start" type="datetime-local" required className="w-full border rounded-xl p-2" />
        </div>
        <div>
          <label className="block text-sm">End</label>
          <input name="end" type="datetime-local" required className="w-full border rounded-xl p-2" />
        </div>
        <div>
          <label className="block text-sm">Capacity</label>
          <input name="capacity" type="number" min={1} required className="w-full border rounded-xl p-2" />
        </div>
        <div>
          <label className="block text-sm">Group (optional)</label>
          <input name="group" type="text" className="w-full border rounded-xl p-2" />
        </div>
        <button className="border rounded-xl px-3 py-2">Create</button>
      </form>
    </div>
  );
}