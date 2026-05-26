import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import TeamAttendanceClient from "./TeamAttendanceClient";
import type { TeamAttendanceRecord, TeamMember } from "./TeamAttendanceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamAttendancePageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

type TeamMemberRow = TeamMember & {
  created_at: string;
};

type TeamWeekRow = {
  week_start: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_TABS = new Set(["members", "attendance", "past"]);
const VALID_GENDERS = new Set(["mens", "womens"]);

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayForDate(date: Date) {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utcDate.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diff);
  return toDateString(utcDate);
}

function normaliseWeekStart(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return mondayForDate(new Date());
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return mondayForDate(new Date());
  return mondayForDate(parsed);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setTime(date.getTime() + days * DAY_MS);
  return toDateString(date);
}

function formatWeekRange(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `${start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} - ${end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default async function TeamAttendancePage({
  searchParams,
}: TeamAttendancePageProps) {
  const params = searchParams ? await searchParams : {};
  const weekStart = normaliseWeekStart(firstSearchValue(params.week));
  const tabParam = firstSearchValue(params.tab) ?? "attendance";
  const genderParam = firstSearchValue(params.gender) ?? "mens";
  const initialTab = VALID_TABS.has(tabParam) ? tabParam : "attendance";
  const initialGender = VALID_GENDERS.has(genderParam) ? genderParam : "mens";
  const status = firstSearchValue(params.teamStatus);
  const message = firstSearchValue(params.teamMessage);
  const isSuccessMessage = status === "success";
  const previousWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);
  const currentWeek = mondayForDate(new Date());
  const defaultExportFrom = addDays(weekStart, -28);

  const db = supabaseServer();
  const { data: memberData, error: membersError } = await db
    .from("team_attendance_members")
    .select("id,name,email,gender,team_number,is_active,created_at")
    .order("gender", { ascending: true })
    .order("team_number", { ascending: true })
    .order("name", { ascending: true });

  const { data: attendanceData, error: attendanceError } = await db
    .from("team_training_attendance")
    .select("member_id,attended,marked_at")
    .eq("week_start", weekStart);

  const { data: weekData } = await db
    .from("team_training_attendance")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(300);

  const attendance = (attendanceData ?? []) as TeamAttendanceRecord[];
  const attendanceMemberIds = new Set(attendance.map((record) => record.member_id));
  const members = ((memberData ?? []) as TeamMemberRow[]).filter(
    (member) => member.is_active || attendanceMemberIds.has(member.id)
  );
  const pastWeeks = Array.from(
    new Set(((weekData ?? []) as TeamWeekRow[]).map((row) => row.week_start))
  ).slice(0, 12);

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Team attendance</h1>
          <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Add members to men&apos;s and women&apos;s teams, then record weekly
            training attendance. Each attendance sheet starts on Monday and old
            weeks are kept as an archive.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
        >
          Back to dashboard
        </Link>
      </div>

      {message && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium shadow-sm ${
            isSuccessMessage
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message}
        </div>
      )}

      {(membersError || attendanceError) && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {membersError
            ? `Failed to load team members: ${membersError.message}`
            : null}
          {attendanceError
            ? ` Failed to load attendance: ${attendanceError.message}`
            : null}
        </div>
      )}

      <TeamAttendanceClient
        weekStart={weekStart}
        weekRange={formatWeekRange(weekStart)}
        previousWeek={previousWeek}
        nextWeek={nextWeek}
        currentWeek={currentWeek}
        defaultExportFrom={defaultExportFrom}
        initialTab={initialTab}
        initialGender={initialGender}
        pastWeeks={pastWeeks}
        members={members}
        initialAttendance={attendance}
      />
    </div>
  );
}
