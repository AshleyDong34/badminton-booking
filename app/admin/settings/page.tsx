export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <form action="/api/admin/settings" method="post" className="space-y-4">
        <div>
          <label className="block text-sm">Weekly booking limit</label>
          <input name="weekly_limit" type="number" min={1} className="w-full border rounded-xl p-2" defaultValue={2} />
        </div>
        <div>
          <label className="block text-sm">Cancellation cutoff (hours)</label>
          <input name="cancel_cutoff_h" type="number" min={0} className="w-full border rounded-xl p-2" defaultValue={2} />
        </div>
        <div>
          <label className="block text-sm">Auto-promote waitlist</label>
          <select name="auto_promote" className="w-full border rounded-xl p-2" defaultValue="on">
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>
        <button className="border rounded-xl px-3 py-2">Save</button>
      </form>
    </div>
  );
}