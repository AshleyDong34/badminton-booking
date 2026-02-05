import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type SessionRow = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
};

type SignupRow = {
  id: string;
  session_id: string;
  name: string;
  email: string;
  student_id: string | null;
  attended: boolean | null;
  created_at: string;
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
    .select("id,name,starts_at,ends_at")
    .in("id", sessionIds);

  if (sessionsErr) {
    return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  }

  const { data: signups, error: signupsErr } = await db
    .from("signups")
    .select("id,session_id,name,email,student_id,attended,created_at,status")
    .in("session_id", sessionIds)
    .eq("status", "signed_up")
    .order("created_at", { ascending: true });

  if (signupsErr) {
    return NextResponse.json({ error: signupsErr.message }, { status: 500 });
  }

  const sessionMap = new Map<string, SessionRow>();
  for (const s of (sessions ?? []) as SessionRow[]) sessionMap.set(s.id, s);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EUBC Badminton";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Session", key: "session", width: 32 },
    { header: "Start", key: "start", width: 20 },
    { header: "End", key: "end", width: 20 },
    { header: "Signed up", key: "signed", width: 12 },
    { header: "Attended", key: "attended", width: 12 },
    { header: "Absent", key: "absent", width: 12 },
  ];

  const attendanceSheet = workbook.addWorksheet("Attendance");
  attendanceSheet.columns = [
    { header: "Session", key: "session", width: 32 },
    { header: "Start", key: "start", width: 20 },
    { header: "End", key: "end", width: 20 },
    { header: "Signup ID", key: "signup_id", width: 36 },
    { header: "Name", key: "name", width: 24 },
    { header: "Email", key: "email", width: 28 },
    { header: "Student ID", key: "student_id", width: 14 },
    { header: "Attended", key: "attended", width: 10 },
    { header: "Signed up at", key: "created_at", width: 22 },
  ];

  const grouped = new Map<string, SignupRow[]>();
  for (const row of (signups ?? []) as SignupRow[]) {
    const list = grouped.get(row.session_id) ?? [];
    list.push(row);
    grouped.set(row.session_id, list);
  }

  for (const sessionId of sessionIds) {
    const session = sessionMap.get(sessionId);
    if (!session) continue;
    const rows = grouped.get(sessionId) ?? [];
    const attendedCount = rows.filter((r) => r.attended).length;
    const absentCount = rows.length - attendedCount;

    summarySheet.addRow({
      session: session.name,
      start: session.starts_at ?? "",
      end: session.ends_at ?? "",
      signed: rows.length,
      attended: attendedCount,
      absent: absentCount,
    });

    for (const row of rows) {
      attendanceSheet.addRow({
        session: session.name,
        start: session.starts_at ?? "",
        end: session.ends_at ?? "",
        signup_id: row.id,
        name: row.name,
        email: row.email,
        student_id: row.student_id ?? "",
        attended: row.attended ? "Yes" : "No",
        created_at: row.created_at,
      });
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
