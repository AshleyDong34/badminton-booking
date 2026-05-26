import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_GENDERS = new Set(["mens", "womens"]);

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

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const isJson = req.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await req.json().catch(() => ({})) : null;
  const form = isJson ? null : await req.formData();
  const name = String((isJson ? payload.name : form?.get("name")) ?? "").trim();
  const emailRaw = String(
    (isJson ? payload.email : form?.get("email")) ?? ""
  )
    .trim()
    .toLowerCase();
  const email = emailRaw || null;
  const gender = String((isJson ? payload.gender : form?.get("gender")) ?? "").trim();
  const teamNumber = Number(
    (isJson ? payload.teamNumber : form?.get("team_number")) ?? 0
  );
  const weekStart = String(
    (isJson ? payload.weekStart : form?.get("week_start")) ?? ""
  ).trim();
  const tab = String((isJson ? payload.tab : form?.get("tab")) ?? "members").trim();
  const genderTab = String(
    (isJson ? payload.genderTab : form?.get("gender_tab")) ?? gender
  ).trim();

  const fail = (message: string) =>
    isJson
      ? NextResponse.json({ error: message }, { status: 400 })
      : redirectToTeamAttendance(req, "error", message, weekStart, tab, genderTab);

  if (!name) {
    return fail("Please enter a player name.");
  }
  if (email && !email.includes("@")) {
    return fail("Please enter a valid email.");
  }
  if (!VALID_GENDERS.has(gender)) {
    return fail("Choose men's or women's team.");
  }
  if (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumber > 6) {
    return fail("Team must be between 1 and 6.");
  }

  const db = supabaseServer();
  const query = db
    .from("team_attendance_members")
    .insert({
      name,
      email,
      gender,
      team_number: teamNumber,
      is_active: true,
    })
    .select("id,name,email,gender,team_number,is_active")
    .single();
  const { data, error } = await query;

  if (error) {
    if (isJson) {
      return NextResponse.json(
        { error: `Could not add team member: ${error.message}` },
        { status: 500 }
      );
    }
    return redirectToTeamAttendance(
      req,
      "error",
      `Could not add team member: ${error.message}`,
      weekStart,
      tab,
      genderTab
    );
  }

  if (isJson) {
    return NextResponse.json({ ok: true, member: data });
  }

  return redirectToTeamAttendance(
    req,
    "success",
    "Team member added.",
    weekStart,
    tab,
    genderTab
  );
}
