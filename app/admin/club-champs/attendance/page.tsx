import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import ClubChampsAttendanceClient, {
  ClubChampsAttendanceEntry,
} from "./ClubChampsAttendanceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EventType = "level_doubles" | "mixed_doubles";

type PairRow = {
  id: string;
  event: EventType;
  player_one_name: string;
  player_two_name: string;
  seed_order: number | null;
  created_at: string | null;
};

type AttendanceRow = {
  pair_id: string;
  player_one_present: boolean | null;
  player_two_present: boolean | null;
};

function sortPairs(a: PairRow, b: PairRow) {
  if (a.event !== b.event) return a.event.localeCompare(b.event);
  const aSeed = a.seed_order ?? Number.MAX_SAFE_INTEGER;
  const bSeed = b.seed_order ?? Number.MAX_SAFE_INTEGER;
  if (aSeed !== bSeed) return aSeed - bSeed;
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

export default async function ClubChampsAttendancePage() {
  const db = supabaseServer();

  const { data: pairData, error: pairError } = await db
    .from("club_champs_pairs")
    .select("id,event,player_one_name,player_two_name,seed_order,created_at");

  if (pairError) {
    return (
      <div className="max-w-6xl space-y-4">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load Club Champs pairs: {pairError.message}
        </p>
      </div>
    );
  }

  const pairs = ((pairData ?? []) as PairRow[]).sort(sortPairs);
  if (pairs.length === 0) {
    return (
      <div className="max-w-6xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Attendance</h1>
            <p className="text-sm text-[var(--muted)]">
              Check players in by event and pair.
            </p>
          </div>
          <Link
            href="/admin/club-champs/pools"
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium shadow-sm"
          >
            Back to pools
          </Link>
        </div>
        <p className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted)] shadow-sm">
          No pair entries yet. Add pairs in Step 1 first.
        </p>
      </div>
    );
  }

  const pairIds = pairs.map((pair) => pair.id);
  const { data: attendanceData, error: attendanceError } = await db
    .from("club_champs_pair_attendance")
    .select("pair_id,player_one_present,player_two_present")
    .in("pair_id", pairIds);

  if (attendanceError) {
    return (
      <div className="max-w-6xl space-y-4">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load attendance table: {attendanceError.message}
        </p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          If this is the first setup, create table{" "}
          <code>public.club_champs_pair_attendance</code> (with pair_id as primary key).
        </p>
      </div>
    );
  }

  const attendanceByPair = new Map<string, AttendanceRow>();
  for (const row of (attendanceData ?? []) as AttendanceRow[]) {
    attendanceByPair.set(row.pair_id, row);
  }

  const entries: ClubChampsAttendanceEntry[] = pairs.map((pair) => {
    const attendance = attendanceByPair.get(pair.id);
    return {
      pairId: pair.id,
      event: pair.event,
      playerOneName: pair.player_one_name,
      playerTwoName: pair.player_two_name,
      playerOnePresent: Boolean(attendance?.player_one_present),
      playerTwoPresent: Boolean(attendance?.player_two_present),
    };
  });

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-[var(--muted)]">
            Check players in by event. Attendance is shared across all admins.
          </p>
        </div>
        <Link
          href="/admin/club-champs/pools"
          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium shadow-sm"
        >
          Back to pools
        </Link>
      </div>

      <ClubChampsAttendanceClient initialEntries={entries} />
    </div>
  );
}
