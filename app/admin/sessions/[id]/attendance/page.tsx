import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import AttendanceClient, { AttendanceSignup } from "./AttendanceClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionRow = {
  id: string;
  name: string;
  starts_at: string | null;
};

type SignupRow = {
  id: string;
  name: string;
  email: string;
  student_id: string | null;
  status: "signed_up" | "waiting_list";
  attended: boolean | null;
};

export default async function AttendancePage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const supabase = supabaseServer();
  const { id: sessionId } = await params;

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id,name,starts_at")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="text-sm text-[var(--muted)]">Session not found.</p>
        <Link className="underline" href="/admin/sessions">
          Back to sessions
        </Link>
      </div>
    );
  }

  const { data: signups, error: signupsError } = await supabase
    .from("signups")
    .select("id,name,email,student_id,status,attended")
    .eq("session_id", sessionId)
    .eq("status", "signed_up")
    .order("created_at", { ascending: true });

  if (signupsError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="text-sm text-[var(--muted)]">
          Failed to load signups: {signupsError.message}
        </p>
        <Link className="underline" href="/admin/sessions">
          Back to sessions
        </Link>
      </div>
    );
  }

  const rows = (signups ?? []) as SignupRow[];
  const attendees: AttendanceSignup[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    student_id: row.student_id ?? null,
    attended: Boolean(row.attended),
  }));

  const s = session as SessionRow;
  const timeLabel = s.starts_at
    ? new Date(s.starts_at).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-[var(--muted)]">
            {s.name}
            {timeLabel ? ` · ${timeLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm"
            href={`/admin/sessions/${sessionId}`}
          >
            Back to session
          </Link>
          <Link
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1 text-xs font-medium shadow-sm"
            href="/admin/sessions"
          >
            All sessions
          </Link>
        </div>
      </div>

      <AttendanceClient sessionId={sessionId} initialSignups={attendees} />
    </div>
  );
}
