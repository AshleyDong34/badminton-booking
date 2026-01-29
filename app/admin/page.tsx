import DashboardClient from "./DashboardClient";
import { supabaseServer } from "@/lib/supabase-server";


type Row = {
  id: string;
  name: string;
  capacity: number;
  signed_up_count: number;
  waiting_list_count: number;
};

export default async function AdminHome() {
  const supabase = supabaseServer();

  // Initial server fetch (fast first paint)
  const { data, error } = await supabase
    .from("admin_session_overview")
    .select("id,name,capacity,signed_up_count,waiting_list_count")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm opacity-80">Failed to load: {error.message}</p>
      </div>
    );
  }

  const initial = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[var(--muted)]">
          Live overview of session capacity and waitlist status.
        </p>
      </div>
      <DashboardClient initial={initial} />
    </div>
  );
}
