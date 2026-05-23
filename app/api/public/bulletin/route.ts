import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const db = supabaseServer();
  const { data, error } = await db
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json(
      {
        club_rules_label: "Club Rules",
        club_rules_description: "Court Rules and Player Attitude",
        club_rules: "",
        useful_info_label: "Useful info",
        useful_info_description: "Links for EUBC",
        useful_info: "",
        court_updates_label: "Court updates",
        court_updates_description: "Coming soon",
        court_updates: "",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    club_rules_label: data?.club_rules_label ?? "Club Rules",
    club_rules_description:
      data?.club_rules_description ?? "Court Rules and Player Attitude",
    club_rules: data?.club_rules ?? "",
    useful_info_label: data?.useful_info_label ?? "Useful info",
    useful_info_description: data?.useful_info_description ?? "Links for EUBC",
    useful_info: data?.useful_info ?? "",
    court_updates_label: data?.court_updates_label ?? "Court updates",
    court_updates_description: data?.court_updates_description ?? "Coming soon",
    court_updates: data?.court_updates ?? "",
  });
}
