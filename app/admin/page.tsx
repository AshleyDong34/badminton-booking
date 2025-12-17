export default async function AdminHome() {


  // this is the default landing page, the dashboard when no links are clicked on yet. 
  // TODO: replace with real loaders (Supabase) – using placeholders for now
  const stats = [
    { label: "Today sessions", value: 3 },
    { label: "Total booked", value: 128 },
    { label: "On waitlist", value: 22 },
  ];
  // this is technically a child component as well for the layout.
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border p-4">
            <div className="text-sm opacity-70">{s.label}</div>
            <div className="text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}