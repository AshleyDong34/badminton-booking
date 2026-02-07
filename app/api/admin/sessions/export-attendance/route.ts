import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type SessionRow = {
  id: string;
  name: string;
};

type SignupRow = {
  id: string;
  session_id: string;
  name: string;
  email: string;
  student_id: string | null;
  attended: boolean | null;
  status: "signed_up" | "waiting_list";
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const body = await req.json().catch(() => ({}));
  const sessionIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.filter((id: unknown) => typeof id === "string")
    : [];

  if (sessionIds.length === 0) {
    return NextResponse.json({ error: "No sessions selected." }, { status: 400 });
  }

  const db = supabaseServer();
  const { data: sessions, error: sessionsErr } = await db
    .from("sessions")
    .select("id,name")
    .in("id", sessionIds);

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  }

  const { data: signups, error: signupsErr } = await db
    .from("signups")
    .select("id,session_id,name,email,student_id,attended,status")
    .in("session_id", sessionIds)
    .eq("status", "signed_up")
    .order("name", { ascending: true });

  if (signupsErr) {
    return NextResponse.json({ error: signupsErr.message }, { status: 500 });
  }

  const sessionMap = new Map<string, SessionRow>();
  for (const s of (sessions ?? []) as SessionRow[]) sessionMap.set(s.id, s);

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
  const fillGrey = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF2F2F2" },
  };

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Session", key: "session", width: 32 },
    { header: "Signed up", key: "signed", width: 12 },
    { header: "Attended", key: "attended", width: 12 },
    { header: "Absent", key: "absent", width: 12 },
    { header: "Attendance taken", key: "taken", width: 18 },
  ];

  const attendanceSheet = workbook.addWorksheet("Attendance");
  attendanceSheet.columns = [
    { header: "Session", key: "session", width: 32 },
    { header: "Name", key: "name", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Student ID", key: "student_id", width: 14 },
    { header: "Attended", key: "attended", width: 10 },
  ];

  const playersSheet = workbook.addWorksheet("Players");
  playersSheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Student ID", key: "student_id", width: 14 },
    { header: "Signed up", key: "signed", width: 12 },
    { header: "Attended", key: "attended", width: 12 },
    { header: "Absent", key: "absent", width: 12 },
  ];

  const grouped = new Map<string, SignupRow[]>();
  for (const row of (signups ?? []) as SignupRow[]) {
    const list = grouped.get(row.session_id) ?? [];
    list.push(row);
    grouped.set(row.session_id, list);
  }

  const playerMap = new Map<
    string,
    { name: string; email: string; student_id: string; signed: number; attended: number }
  >();

  for (const sessionId of sessionIds) {
    const session = sessionMap.get(sessionId);
    if (!session) continue;
    const rows = grouped.get(sessionId) ?? [];
    const attendedCount = rows.filter((r) => r.attended).length;
    const absentCount = rows.length - attendedCount;
    const attendanceTaken =
      rows.length === 0 ? "No signups" : attendedCount > 0 ? "Yes" : "No";

    const summaryRow = summarySheet.addRow({
      session: session.name,
      signed: rows.length,
      attended: attendedCount,
      absent: absentCount,
      taken: attendanceTaken,
    });
    const takenCell = summaryRow.getCell("taken");
    if (attendanceTaken === "Yes") takenCell.fill = fillGreen;
    else if (attendanceTaken === "No") takenCell.fill = fillRed;
    else takenCell.fill = fillGrey;

    for (const row of rows) {
      const attendanceRow = attendanceSheet.addRow({
        session: session.name,
        name: row.name,
        email: row.email,
        student_id: row.student_id ?? "",
        attended: row.attended ? "Yes" : "No",
      });
      const attendanceCell = attendanceRow.getCell("attended");
      attendanceCell.fill = row.attended ? fillGreen : fillRed;

      const emailKey = row.email.trim().toLowerCase();
      const existing = playerMap.get(emailKey);
      if (existing) {
        existing.signed += 1;
        if (row.attended) existing.attended += 1;
        if (!existing.student_id && row.student_id) {
          existing.student_id = row.student_id;
        }
        if (!existing.name && row.name) existing.name = row.name;
      } else {
        playerMap.set(emailKey, {
          name: row.name ?? "",
          email: row.email,
          student_id: row.student_id ?? "",
          signed: 1,
          attended: row.attended ? 1 : 0,
        });
      }
    }
  }

  const playerRows = Array.from(playerMap.values()).map((player) => ({
    ...player,
    absent: player.signed - player.attended,
  }));

  playerRows.sort((a, b) => a.name.localeCompare(b.name));
  for (const player of playerRows) {
    const playerRow = playersSheet.addRow(player);
    const attendedCell = playerRow.getCell("attended");
    const absentCell = playerRow.getCell("absent");
    if (player.attended === 0 && player.signed > 0) {
      attendedCell.fill = fillRed;
    } else if (player.attended === player.signed && player.signed > 0) {
      attendedCell.fill = fillGreen;
    }
    if (player.absent > 0) {
      absentCell.fill = fillRed;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendance-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
