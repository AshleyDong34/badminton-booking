import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

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
        allow_name_only: false,
        club_champs_public_enabled: false,
        club_champs_pairs_only_public: false,
        sessions_public_enabled: true,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    allow_name_only: Boolean(data?.allow_name_only),
    club_champs_public_enabled: Boolean(data?.club_champs_public_enabled),
    club_champs_pairs_only_public: Boolean(data?.club_champs_pairs_only_public),
    sessions_public_enabled: data?.sessions_public_enabled ?? true,
  });
}
