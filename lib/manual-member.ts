import type { supabaseServer } from "./supabase-server";
import { normalizeName, normalizeStudentId, validEmail } from "./membership-roster.ts";

type Db = ReturnType<typeof supabaseServer>;
type Member = { id: string; name: string | null; student_id: string | null; email: string | null };
type Result = { status: number; body: { error: string } | { ok: true; action: "added" | "updated" } };

export async function saveManualMember(db: Db, body: Record<string, unknown>): Promise<Result> {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const rawId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const studentId = rawId ? normalizeStudentId(rawId) : null;
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const email = rawEmail || null;
  const createSeparate = body.createSeparate === true;

  if (!name || name.length > 160) return { status: 400, body: { error: "Enter a name of 1 to 160 characters." } };
  if (studentId && !/^s[0-9]{7}$/.test(studentId)) {
    return { status: 400, body: { error: "Enter a valid student ID, or leave it blank." } };
  }
  if (email && !validEmail(email)) return { status: 400, body: { error: "Enter a valid email address, or leave it blank." } };

  let existing: Member | null = null;
  if (studentId) {
    const { data, error } = await db.from("student_whitelist")
      .select("id,name,student_id,email").eq("student_id", studentId).maybeSingle();
    if (error) return { status: 500, body: { error: error.message } };
    existing = data;
  } else if (!createSeparate) {
    const matches: Member[] = [];
    const key = normalizeName(name);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("student_whitelist")
        .select("id,name,student_id,email").not("name", "is", null).order("id").range(from, from + 999);
      if (error) return { status: 500, body: { error: error.message } };
      matches.push(...(data ?? []).filter((member) => member.name && normalizeName(member.name) === key));
      if (!data || data.length < 1000) break;
    }
    if (matches.length > 1) {
      return { status: 409, body: { error: "More than one member has this name. Confirm this is a separate person before adding another row." } };
    }
    existing = matches[0] ?? null;
  }

  if (email) {
    const { data: emailMatch, error } = await db.from("student_whitelist")
      .select("id,name,student_id,email").eq("email", email).maybeSingle();
    if (error) return { status: 500, body: { error: error.message } };
    if (emailMatch && existing && emailMatch.id !== existing.id) {
      return { status: 409, body: { error: "That email already belongs to a different member." } };
    }
    if (emailMatch && !existing) {
      if (normalizeName(emailMatch.name ?? "") !== normalizeName(name)) {
        return { status: 409, body: { error: "That email belongs to a member with a different name. Review the existing record before changing it." } };
      }
      existing = emailMatch;
    }
  }

  const values: Record<string, string | null> = { name };
  if (studentId) values.student_id = studentId;
  if (email) values.email = email;
  if (existing) {
    const { error } = await db.from("student_whitelist").update(values).eq("id", existing.id);
    if (error) {
      const duplicate = error.code === "23505";
      return { status: duplicate ? 409 : 500, body: { error: duplicate ? "That student ID or email is already assigned to another member." : error.message } };
    }
    return { status: 200, body: { ok: true, action: "updated" } };
  }

  const { error } = await db.from("student_whitelist").insert({ name, student_id: studentId, email });
  if (error) {
    const duplicate = error.code === "23505";
    return { status: duplicate ? 409 : 500, body: { error: duplicate ? "That student ID or email is already assigned to another member." : error.message } };
  }
  return { status: 200, body: { ok: true, action: "added" } };
}
