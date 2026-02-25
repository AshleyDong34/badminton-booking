import { supabaseServer } from "@/lib/supabase-server";
import PairForm from "./PairForm";
import PairImportForm from "./PairImportForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EVENT_LABEL: Record<string, string> = {
  level_doubles: "Level doubles",
  mixed_doubles: "Mixed doubles",
};

const LEVEL_DOUBLES_TYPE_LABEL: Record<string, string> = {
  mens_doubles: "Men's doubles",
  womens_doubles: "Women's doubles",
};

type Row = {
  id: string;
  event: string;
  level_doubles_type: string | null;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  pair_strength: number | null;
  created_at: string | null;
};

type SearchParams = {
  ok?: string;
  removed?: string;
  visibility_saved?: string;
  imported?: string;
  imported_level?: string;
  imported_mixed?: string;
  error?: string;
};

export default async function ClubChampsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const db = supabaseServer();

  const { data, error } = await db
    .from("club_champs_pairs")
    .select(
      "id,event,level_doubles_type,player_one_name,player_one_level,player_two_name,player_two_level,pair_strength,created_at"
    )
    .order("created_at", { ascending: false });
  const { data: settingsData } = await db
    .from("settings")
    .select("club_champs_public_enabled,club_champs_pairs_only_public")
    .eq("id", 1)
    .single();

  const rows = (data ?? []) as Row[];
  const mixedRows = rows.filter((row) => row.event === "mixed_doubles");
  const levelRows = rows.filter((row) => row.event === "level_doubles");
  const clubChampsPublicEnabled = Boolean(settingsData?.club_champs_public_enabled);
  const clubChampsPairsOnlyPublic = Boolean(settingsData?.club_champs_pairs_only_public);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Club champs</h1>
        <p className="text-sm text-[var(--muted)]">
          Step 1: Add pair entries for each event with player levels.
        </p>
      </div>

      {(params.ok || params.removed || params.visibility_saved || params.imported) && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm text-[var(--ink)]">
          {params.removed
            ? "Pair removed."
            : params.visibility_saved
            ? "Club champs public visibility settings updated."
            : params.imported
            ? `CSV import complete: ${Number(params.imported_level ?? 0)} level pairs, ${Number(
                params.imported_mixed ?? 0
              )} mixed pairs.`
            : "Pair saved."}
        </p>
      )}
      {params.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
        <form action="/api/admin/champs/public-visibility" method="post" className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip)] p-3">
            <input
              id="club_champs_public_enabled"
              name="club_champs_public_enabled"
              type="checkbox"
              defaultChecked={clubChampsPublicEnabled}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm">
              <span className="block font-medium">Show Club champs section on landing page</span>
              <span className="block text-xs text-[var(--muted)]">
                When enabled, users can see and open the Club champs section from the public home page.
              </span>
            </span>
          </label>
          {clubChampsPublicEnabled ? (
            <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-white p-3">
              <input type="hidden" name="club_champs_pairs_only_public" value="off" />
              <input
                id="club_champs_pairs_only_public"
                name="club_champs_pairs_only_public"
                type="checkbox"
                value="on"
                defaultChecked={clubChampsPairsOnlyPublic}
                className="mt-1 h-4 w-4"
              />
              <span className="text-sm">
                <span className="block font-medium">Hide knockout and pools, only show pairings</span>
                <span className="block text-xs text-[var(--muted)]">
                  Hide pools and knockout pages for users while keeping pairings visible.
                </span>
              </span>
            </label>
          ) : null}
          <button className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm">
            Save visibility
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <div className="mb-3 space-y-1">
          <h2 className="text-lg font-semibold">Manual pair entry</h2>
          <p className="text-sm text-[var(--muted)]">
            Add one pairing at a time.
          </p>
        </div>
        <PairForm />
      </div>

      <PairImportForm />

      {error && (
        <p className="text-sm text-red-600">Failed to load entries: {error.message}</p>
      )}

      <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            Level doubles{" "}
            <span className="text-sm font-medium text-[var(--muted)]">({levelRows.length} pairs)</span>
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Men&apos;s and women&apos;s level doubles entries.
          </p>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                <tr className="text-left">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Player 1</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Player 2</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Pair strength</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {levelRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
                  >
                    <td className="px-4 py-3">
                      {LEVEL_DOUBLES_TYPE_LABEL[row.level_doubles_type ?? ""] ?? "-"}
                    </td>
                    <td className="px-4 py-3">{row.player_one_name}</td>
                    <td className="px-4 py-3">{renderLevel(row.player_one_level)}</td>
                    <td className="px-4 py-3">{row.player_two_name}</td>
                    <td className="px-4 py-3">{renderLevel(row.player_two_level)}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                      {renderPairStrength(row)}
                    </td>
                    <td className="px-4 py-3">
                      <form action="/api/admin/champs/pairs/remove" method="post">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="redirect" value="/admin/club-champs" />
                        <button className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {levelRows.length === 0 && (
              <p className="px-4 py-6 text-sm text-[var(--muted)]">
                No level doubles pairings yet.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            Mixed doubles{" "}
            <span className="text-sm font-medium text-[var(--muted)]">({mixedRows.length} pairs)</span>
          </h2>
          <p className="text-sm text-[var(--muted)]">Mixed doubles entries.</p>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-sm overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--muted)]">
                <tr className="text-left">
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Player 1</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Player 2</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Pair strength</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mixedRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-[var(--chip)]"}
                  >
                    <td className="px-4 py-3">{EVENT_LABEL[row.event] ?? row.event}</td>
                    <td className="px-4 py-3">{row.player_one_name}</td>
                    <td className="px-4 py-3">{renderLevel(row.player_one_level)}</td>
                    <td className="px-4 py-3">{row.player_two_name}</td>
                    <td className="px-4 py-3">{renderLevel(row.player_two_level)}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--ink)]">
                      {renderPairStrength(row)}
                    </td>
                    <td className="px-4 py-3">
                      <form action="/api/admin/champs/pairs/remove" method="post">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="redirect" value="/admin/club-champs" />
                        <button className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mixedRows.length === 0 && (
              <p className="px-4 py-6 text-sm text-[var(--muted)]">
                No mixed doubles pairings yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function renderLevel(value: number | string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 6) {
    return `Team ${numeric}`;
  }
  if (numeric === 7) return "Rec";
  if (typeof value === "string" && value.trim()) return value;
  return "-";
}

function renderPairStrength(row: Row) {
  if (typeof row.pair_strength === "number") return row.pair_strength;

  const p1 = typeof row.player_one_level === "number" ? row.player_one_level : Number(row.player_one_level);
  const p2 = typeof row.player_two_level === "number" ? row.player_two_level : Number(row.player_two_level);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return "-";

  const bonus =
    row.event === "level_doubles" && row.level_doubles_type === "womens_doubles" ? 3 : 0;
  return p1 + p2 + bonus;
}
