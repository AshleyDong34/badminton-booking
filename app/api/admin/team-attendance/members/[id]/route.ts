import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

function redirectToTeamAttendance(
  req: NextRequest,
  kind: "success" | "error",
  message: string,
  weekStart?: string,
  tab?: string,
  gender?: string
) {
  const url = new URL("/admin/team-attendance", getBaseUrl(req));
  if (weekStart) url.searchParams.set("week", weekStart);
  if (tab) url.searchParams.set("tab", tab);
  if (gender) url.searchParams.set("gender", gender);
  url.searchParams.set("teamStatus", kind);
  url.searchParams.set("teamMessage", message);
  return NextResponse.redirect(url, { status: 303 });
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

  const { id } = await ctx.params;
  const isJson = req.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await req.json().catch(() => ({})) : null;
  const form = isJson ? null : await req.formData();
  const weekStart = String(
    (isJson ? payload.weekStart : form?.get("week_start")) ?? ""
  ).trim();
  const tab = String((isJson ? payload.tab : form?.get("tab")) ?? "members").trim();
  const genderTab = String(
    (isJson ? payload.genderTab : form?.get("gender_tab")) ?? ""
  ).trim();

  if (!id) {
    if (isJson) {
      return NextResponse.json({ error: "Missing member id." }, { status: 400 });
    }
    return redirectToTeamAttendance(
      req,
      "error",
      "Missing member id.",
      weekStart,
      tab,
      genderTab
    );
  }

  const db = supabaseServer();
  const { error } = await db
    .from("team_attendance_members")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (isJson) {
      return NextResponse.json(
        { error: `Could not remove team member: ${error.message}` },
        { status: 500 }
      );
    }
    return redirectToTeamAttendance(
      req,
      "error",
      `Could not remove team member: ${error.message}`,
      weekStart,
      tab,
      genderTab
    );
  }

  if (isJson) {
    return NextResponse.json({ ok: true });
  }

  return redirectToTeamAttendance(
    req,
    "success",
    "Team member removed from the active list. Old attendance is still archived.",
    weekStart,
    tab,
    genderTab
  );
}
