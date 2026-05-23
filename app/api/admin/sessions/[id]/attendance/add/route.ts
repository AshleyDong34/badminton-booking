import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";

type SignupRow = {
  id: string;
  name: string;
  email: string;
  student_id: string | null;
  attended: boolean | null;
};

function normaliseStudentId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const { id: sessionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const studentIdRaw =
    typeof body.student_id === "string" ? normaliseStudentId(body.student_id) : "";
  const studentId = studentIdRaw || null;

  if (!sessionId || !name || !email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Enter a name and valid email." },
      { status: 400 }
    );
  }

  if (studentId && !/^s\d{7}$/.test(studentId)) {
    return NextResponse.json(
      { error: "Student ID must be in the format s1234567." },
      { status: 400 }
    );
  }

  const db = supabaseServer();
  const { data: session } = await db
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  let duplicateQuery = `email.eq.${email}`;
  if (studentId) duplicateQuery += `,student_id.eq.${studentId}`;

  const { data: duplicate, error: duplicateError } = await db
    .from("signups")
    .select("id")
    .eq("session_id", sessionId)
    .or(duplicateQuery)
    .maybeSingle();

  if (duplicateError) {
    return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  }

  if (duplicate) {
    return NextResponse.json(
      { error: "This person is already on this session." },
      { status: 409 }
    );
  }

  const { data: signup, error } = await db
    .from("signups")
    .insert({
      session_id: sessionId,
      name,
      email,
      student_id: studentId,
      status: "signed_up",
      attended: true,
      cancel_token: crypto.randomUUID(),
    })
    .select("id,name,email,student_id,attended")
    .single<SignupRow>();

  if (error || !signup) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to add attendee." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    attendee: {
      id: signup.id,
      name: signup.name,
      email: signup.email,
      student_id: signup.student_id,
      attended: Boolean(signup.attended),
    },
  });
}

