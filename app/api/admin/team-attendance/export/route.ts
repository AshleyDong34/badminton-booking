import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type TeamGender = "mens" | "womens";

type TeamMemberRow = {
  id: string;
  name: string;
  email: string | null;
  gender: TeamGender;
  team_number: number;
  is_active: boolean;
  created_at: string;
};

type AttendanceRow = {
  member_id: string;
  week_start: string;
  attended: boolean;
  marked_at: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPORT_WEEKS = 104;

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

function parseWeek(value: string | null, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return mondayForDate(parsed);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setTime(date.getTime() + days * DAY_MS);
  return toDateString(date);
}

function listWeeks(from: string, to: string) {
  const weeks: string[] = [];
  let cursor = from;
  while (cursor <= to && weeks.length < MAX_EXPORT_WEEKS) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

function formatWeek(weekStart: string) {
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

function genderLabel(gender: TeamGender) {
  return gender === "mens" ? "Men's" : "Women's";
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDFF5E1" },
  };
  header.alignment = { vertical: "middle" };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const url = new URL(req.url);
  const currentWeek = mondayForDate(new Date());
  let fromWeek = parseWeek(url.searchParams.get("from"), addDays(currentWeek, -28));
  let toWeek = parseWeek(url.searchParams.get("to"), currentWeek);

  if (fromWeek > toWeek) {
    [fromWeek, toWeek] = [toWeek, fromWeek];
  }

  const weeks = listWeeks(fromWeek, toWeek);
  if (weeks.length === 0) {
    return NextResponse.json({ error: "No weeks selected." }, { status: 400 });
  }
  if (weeks.length >= MAX_EXPORT_WEEKS) {
    return NextResponse.json(
      { error: `Please export ${MAX_EXPORT_WEEKS - 1} weeks or fewer at a time.` },
      { status: 400 }
    );
  }

  const db = supabaseServer();
  const { data: membersData, error: membersError } = await db
    .from("team_attendance_members")
    .select("id,name,email,gender,team_number,is_active,created_at")
    .order("gender", { ascending: true })
    .order("team_number", { ascending: true })
    .order("name", { ascending: true });

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const { data: attendanceData, error: attendanceError } = await db
    .from("team_training_attendance")
    .select("member_id,week_start,attended,marked_at")
    .gte("week_start", fromWeek)
    .lte("week_start", toWeek);

  if (attendanceError) {
    return NextResponse.json({ error: attendanceError.message }, { status: 500 });
  }

  const attendanceRows = (attendanceData ?? []) as AttendanceRow[];
  const attendanceMemberIds = new Set(attendanceRows.map((row) => row.member_id));
  const members = ((membersData ?? []) as TeamMemberRow[]).filter(
    (member) => member.is_active || attendanceMemberIds.has(member.id)
  );

  const attendanceMap = new Map<string, AttendanceRow>();
  for (const row of attendanceRows) {
    attendanceMap.set(`${row.member_id}:${row.week_start}`, row);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EUBC Badminton";
  workbook.created = new Date();

  const fillGreen = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFDFF5E1" },
  };
  const fillRed = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFFDE2E1" },
  };

  const summarySheet = workbook.addWorksheet("Weekly summary");
  summarySheet.columns = [
    { header: "Week start", key: "week_start", width: 14 },
    { header: "Week", key: "week", width: 24 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Team", key: "team", width: 10 },
    { header: "Members", key: "members", width: 10 },
    { header: "Present", key: "present", width: 10 },
    { header: "Absent", key: "absent", width: 10 },
  ];

  const registerSheet = workbook.addWorksheet("Register");
  registerSheet.columns = [
    { header: "Week start", key: "week_start", width: 14 },
    { header: "Week", key: "week", width: 24 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Team", key: "team", width: 10 },
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "Active member", key: "active", width: 14 },
    { header: "Attended", key: "attended", width: 12 },
    { header: "Marked at", key: "marked_at", width: 24 },
  ];

  const totalsSheet = workbook.addWorksheet("Member totals");
  totalsSheet.columns = [
    { header: "Gender", key: "gender", width: 12 },
    { header: "Team", key: "team", width: 10 },
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "Active member", key: "active", width: 14 },
    { header: "Weeks exported", key: "weeks", width: 16 },
    { header: "Attended", key: "attended", width: 12 },
    { header: "Absent", key: "absent", width: 12 },
  ];

  const totals = new Map<
    string,
    {
      member: TeamMemberRow;
      attended: number;
      absent: number;
    }
  >();

  for (const week of weeks) {
    const weekLabel = formatWeek(week);
    for (const gender of ["mens", "womens"] as TeamGender[]) {
      for (let teamNumber = 1; teamNumber <= 6; teamNumber += 1) {
        const teamMembers = members.filter(
          (member) => {
            if (member.gender !== gender || member.team_number !== teamNumber) {
              return false;
            }
            const attendance = attendanceMap.get(`${member.id}:${week}`);
            const createdWeek = mondayForDate(new Date(member.created_at));
            return createdWeek <= week || Boolean(attendance);
          }
        );
        const present = teamMembers.filter(
          (member) => attendanceMap.get(`${member.id}:${week}`)?.attended
        ).length;
        const absent = teamMembers.length - present;

        summarySheet.addRow({
          week_start: week,
          week: weekLabel,
          gender: genderLabel(gender),
          team: teamNumber,
          members: teamMembers.length,
          present,
          absent,
        });

        for (const member of teamMembers) {
          const attendance = attendanceMap.get(`${member.id}:${week}`);
          const attended = Boolean(attendance?.attended);
          const row = registerSheet.addRow({
            week_start: week,
            week: weekLabel,
            gender: genderLabel(member.gender),
            team: member.team_number,
            name: member.name,
            email: member.email ?? "",
            active: member.is_active ? "Yes" : "No",
            attended: attended ? "Yes" : "No",
            marked_at: attendance?.marked_at
              ? new Date(attendance.marked_at).toLocaleString("en-GB")
              : "",
          });
          row.getCell("attended").fill = attended ? fillGreen : fillRed;

          const total = totals.get(member.id) ?? {
            member,
            attended: 0,
            absent: 0,
          };
          if (attended) total.attended += 1;
          else total.absent += 1;
          totals.set(member.id, total);
        }
      }
    }
  }

  for (const total of Array.from(totals.values()).sort((a, b) =>
    a.member.name.localeCompare(b.member.name)
  )) {
    const row = totalsSheet.addRow({
      gender: genderLabel(total.member.gender),
      team: total.member.team_number,
      name: total.member.name,
      email: total.member.email ?? "",
      active: total.member.is_active ? "Yes" : "No",
      weeks: weeks.length,
      attended: total.attended,
      absent: total.absent,
    });
    if (total.absent > 0) row.getCell("absent").fill = fillRed;
    if (total.attended === weeks.length) row.getCell("attended").fill = fillGreen;
  }

  for (const sheet of [summarySheet, registerSheet, totalsSheet]) {
    styleHeader(sheet);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `team-attendance-${fromWeek}-to-${toWeek}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
