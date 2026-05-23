import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

function text(form: FormData, name: string, fallback = "") {
  const value = String(form.get(name) ?? "").trim();
  return value || fallback;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const payload = {
    id: 1,
    club_rules_label: text(form, "club_rules_label", "Club Rules"),
    club_rules_description: text(
      form,
      "club_rules_description",
      "Court Rules and Player Attitude"
    ),
    club_rules: String(form.get("club_rules") ?? ""),
    useful_info_label: text(form, "useful_info_label", "Useful info"),
    useful_info_description: text(
      form,
      "useful_info_description",
      "Links for EUBC"
    ),
    useful_info: String(form.get("useful_info") ?? ""),
    court_updates_label: text(form, "court_updates_label", "Court updates"),
    court_updates_description: text(
      form,
      "court_updates_description",
      "Coming soon"
    ),
    court_updates: String(form.get("court_updates") ?? ""),
  };

  const db = supabaseServer();
  const { error } = await db.from("settings").upsert(payload, {
    onConflict: "id",
  });

  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.redirect(new URL("/admin/noticeboard", getBaseUrl(req)), {
    status: 303,
  });
}
