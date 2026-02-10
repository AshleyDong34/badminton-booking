import { supabaseServer } from "@/lib/supabase-server";
import SeedBoard from "../SeedBoard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = {
  id: string;
  event: "level_doubles" | "mixed_doubles";
  level_doubles_type: string | null;
  player_one_name: string;
  player_one_level: number | string;
  player_two_name: string;
  player_two_level: number | string;
  seed_order: number | null;
  created_at: string | null;
};

export default async function ClubChampsSeedingPage() {
  const db = supabaseServer();
  const { data, error } = await db
    .from("club_champs_pairs")
    .select(
      "id,event,level_doubles_type,player_one_name,player_one_level,player_two_name,player_two_level,seed_order,created_at"
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const levelRows = rows.filter((row) => row.event === "level_doubles");
  const mixedRows = rows.filter((row) => row.event === "mixed_doubles");

  const bySeedThenTime = (a: Row, b: Row) => {
    const sa = a.seed_order ?? Number.MAX_SAFE_INTEGER;
    const sb = b.seed_order ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  };

  return (
    <div className="max-w-5xl space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load pairs for seeding: {error.message}
        </p>
      )}

      <SeedBoard
        levelRows={[...levelRows].sort(bySeedThenTime)}
        mixedRows={[...mixedRows].sort(bySeedThenTime)}
      />
    </div>
  );
}
