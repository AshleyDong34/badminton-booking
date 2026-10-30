import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const emailRaw = String(form.get("email") ?? "").trim().toLowerCase();
  const studentIdRaw = String(form.get("student_id") ?? "").trim().toLowerCase();
  const redirect = String(form.get("redirect") ?? "/admin/first-time");

  if (!name || !emailRaw || !emailRaw.includes("@")) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=Name+and+email+are+required`, getBaseUrl(req))
    );
  }

  if (studentIdRaw && !/^s\d{7}$/.test(studentIdRaw)) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=Student+ID+must+be+format+s1234567`, getBaseUrl(req))
    );
  }

  const db = supabaseServer();
  const { data: existing, error: existsErr } = await db
    .from("first_time_signups")
    .select("id")
    .or(`email.eq.${emailRaw}${studentIdRaw ? `,student_id.eq.${studentIdRaw}` : ""}`)
    .limit(1)
    .maybeSingle();

  if (existsErr) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=${encodeURIComponent(existsErr.message)}`, getBaseUrl(req))
    );
  }

  if (existing) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=Entry+already+exists`, getBaseUrl(req))
    );
  }

  const { error } = await db
    .from("first_time_signups")
    .insert({ name, email: emailRaw, student_id: studentIdRaw || null });

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/first-time?error=${encodeURIComponent(error.message)}`, getBaseUrl(req))
    );
  }

  return NextResponse.redirect(
    new URL(
      `${redirect}${redirect.includes("?") ? "&" : "?"}ok=1`,
      getBaseUrl(req)
    )
  );
}
