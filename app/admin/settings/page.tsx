import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsRow = {
  id: number;
  weekly_quota: number; // <-- rename this if your column is weekly_limit
  allow_same_day_multi: boolean;
};

export default async function SettingsPage() {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("settings")
    .select("id,weekly_quota,allow_same_day_multi")
    .eq("id", 1)
    .single();

  // sensible defaults if table empty / error
  const s: SettingsRow = (data as SettingsRow) ?? {
    id: 1,
    weekly_quota: 2,
    allow_same_day_multi: false,
  };

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {error && (
        <p className="text-sm opacity-80">
          Failed to load settings (using defaults): {error.message}
        </p>
      )}

      <form action="/api/admin/settings" method="post" className="space-y-4">
        <div>
          <label className="block text-sm">Weekly booking limit per player</label>
          <input
            name="weekly_quota" // <-- rename if your DB column is weekly_limit
            type="number"
            min={1}
            required
            className="w-full border rounded-xl p-2"
            defaultValue={s.weekly_quota ?? 2}
          />
        </div>

        <div>
          <label className="block text-sm">Allow multiple sessions on the same day</label>
          <select
            name="allow_same_day_multi"
            className="w-full border rounded-xl p-2"
            defaultValue={s.allow_same_day_multi ? "true" : "false"}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>

        <button className="border rounded-xl px-3 py-2">Save</button>
      </form>
    </div>
  );
}
