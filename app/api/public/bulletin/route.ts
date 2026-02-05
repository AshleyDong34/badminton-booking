import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const db = supabaseServer();
  const { data, error } = await db
    .from("settings")
    .select("club_rules,useful_info")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json({ club_rules: "", useful_info: "" }, { status: 200 });
  }

  return NextResponse.json({
    club_rules: data?.club_rules ?? "",
    useful_info: data?.useful_info ?? "",
  });
}
