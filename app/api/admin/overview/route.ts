import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  // Server endpoint (API route): runs on server, can use service role key safely.
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("admin_session_overview")
    .select("id,name,capacity,signed_up_count,waiting_list_count")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] }, { status: 200 });
}
