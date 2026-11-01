import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { supabaseServer } from "@/lib/supabase-server";
import { DEFAULT_MEMBERSHIP_IMPORT_COLUMNS } from "@/lib/import-column-mappings";
import { normalizeStudentId, parseMembershipRoster, reviewNoIdMembers } from "@/lib/membership-roster";

export const runtime = "nodejs";
const PAGE_SIZE = 1000;

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? "Unauthorized" : "Forbidden" }, { status });
  }

  const form = await req.formData();
  const file = form.get("file");
  const columns = {
    name: String(form.get("membership_col_name") ?? "").trim() || DEFAULT_MEMBERSHIP_IMPORT_COLUMNS.name,
    email: String(form.get("membership_col_email") ?? "").trim() || DEFAULT_MEMBERSHIP_IMPORT_COLUMNS.email,
    studentId: String(form.get("membership_col_student_id") ?? "").trim() || DEFAULT_MEMBERSHIP_IMPORT_COLUMNS.studentId,
  };
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file upload." }, { status: 400 });

  let roster: Awaited<ReturnType<typeof parseMembershipRoster>>;
  try {
    roster = await parseMembershipRoster(await file.arrayBuffer(), file.name, columns);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse roster." }, { status: 400 });
  }

  const db = supabaseServer();
  const existingIds = new Set<string>();
  if (roster.idMembers.length > 0) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db.from("student_whitelist")
        .select("student_id").not("student_id", "is", null)
        .order("student_id").range(from, from + PAGE_SIZE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const member of data ?? []) existingIds.add(normalizeStudentId(member.student_id));
      if (!data || data.length < PAGE_SIZE) break;
    }
    const { error } = await db.rpc("upsert_membership_roster", { p_members: roster.idMembers });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const existingNames: Array<string | null> = [];
  if (roster.withoutStudentId.length > 0) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from("student_whitelist")
        .select("name")
        .not("name", "is", null)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      existingNames.push(...(data ?? []).map((member) => member.name));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  const { error: mappingError } = await db.from("settings").upsert({
    id: 1,
    membership_import_columns: columns,
  }, { onConflict: "id" });

  return NextResponse.json({
    ok: true,
    sourceRows: roster.sourceRows,
    idMembersProcessed: roster.idMembers.length,
    idMembersAdded: roster.idMembers.filter((member) => !existingIds.has(member.student_id)).length,
    idMembersUpdated: roster.idMembers.filter((member) => existingIds.has(member.student_id)).length,
    idConflicts: roster.idConflicts,
    noIdReview: reviewNoIdMembers(roster.withoutStudentId, existingNames),
    mappingSaved: !mappingError,
  });
}
