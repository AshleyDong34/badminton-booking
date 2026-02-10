import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsRow = {
  id: number;
  weekly_quota: number; // <-- rename this if your column is weekly_limit
  allow_same_day_multi: boolean;
  allow_name_only?: boolean; // <-- add this column in settings to persist
  booking_window_days?: number | null;
  sessions_public_enabled?: boolean | null;
  club_rules?: string | null;
  useful_info?: string | null;
};

export default async function SettingsPage() {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  // sensible defaults if table empty / error
  const s: SettingsRow = (data as SettingsRow) ?? {
    id: 1,
    weekly_quota: 2,
    allow_same_day_multi: false,
    allow_name_only: false,
    booking_window_days: 7,
    sessions_public_enabled: true,
    club_rules: "",
    useful_info: "",
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Control booking limits and membership rules.
        </p>
      </div>

      {error && (
        <p className="text-sm text-[var(--muted)]">
          Failed to load settings (using defaults): {error.message}
        </p>
      )}

      <form
        action="/api/admin/settings"
        method="post"
        className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm"
      >
        <div>
          <label className="block text-sm font-medium">Weekly booking limit per player</label>
          <input
            name="weekly_quota" // <-- rename if your DB column is weekly_limit
            type="number"
            min={1}
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            defaultValue={s.weekly_quota ?? 2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Allow multiple sessions on the same day</label>
          <select
            name="allow_same_day_multi"
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            defaultValue={s.allow_same_day_multi ? "true" : "false"}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Session visibility window (days)</label>
          <input
            name="booking_window_days"
            type="number"
            min={0}
            max={365}
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
            defaultValue={s.booking_window_days ?? 7}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Users can see sessions up to this many days before the start time.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
          <input
            id="sessions_public_enabled"
            name="sessions_public_enabled"
            type="checkbox"
            defaultChecked={s.sessions_public_enabled ?? true}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm">
            <span className="block font-medium">Show sessions on public site</span>
            <span className="block text-xs text-[var(--muted)]">
              Turn this off to hide all session cards and prevent direct booking-page access.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
          <input
            id="allow_name_only"
            name="allow_name_only"
            type="checkbox"
            defaultChecked={Boolean(s.allow_name_only)}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm">
            <span className="block font-medium">Default: allow name + email only</span>
            <span className="block text-xs text-[var(--muted)]">
              This becomes the preselected option for new sessions. Each session can override it.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Club rules (bulletin)</label>
          <textarea
            name="club_rules"
            rows={6}
            defaultValue={s.club_rules ?? ""}
            className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm"
            placeholder="- Bring a racket\n- Wear court shoes\n- Arrive 10 minutes early\nMore info: https://eubcbadminton.co.uk"
          />
          <p className="text-xs text-[var(--muted)]">
            Supports bullet lines starting with <code>-</code> and links like
            <code> [text](https://...)</code>.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Useful information (bulletin)</label>
          <textarea
            name="useful_info"
            rows={6}
            defaultValue={s.useful_info ?? ""}
            className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm"
            placeholder="- Parking is limited\n- Bring a water bottle\nContact: committee@eubcbadminton.co.uk"
          />
          <p className="text-xs text-[var(--muted)]">
            Supports bullet lines starting with <code>-</code> and links like
            <code> [text](https://...)</code>.
          </p>
        </div>

        <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
          Save settings
        </button>
      </form>
    </div>
  );
}
