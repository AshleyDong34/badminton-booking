import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type SignupRow = {
  status: "signed_up" | "waiting_list";
};

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const db = supabaseServer();

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("id,name,capacity,starts_at,ends_at,notes,allow_name_only")
    .eq("id", id)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const { data: signups, error: signupsErr } = await db
    .from("signups")
    .select("status")
    .eq("session_id", id);

  if (signupsErr) {
    return NextResponse.json({ error: signupsErr.message }, { status: 500 });
  }

  let signed = 0;
  let waitlist = 0;
  for (const row of (signups ?? []) as SignupRow[]) {
    if (row.status === "signed_up") signed += 1;
    if (row.status === "waiting_list") waitlist += 1;
  }

  let allowNameOnly = session.allow_name_only;
  if (allowNameOnly == null) {
    const { data: settings } = await db
      .from("settings")
      .select("allow_name_only")
      .eq("id", 1)
      .single();
    allowNameOnly = settings?.allow_name_only ?? false;
  }

  return NextResponse.json({
    session: {
      ...session,
      allow_name_only: Boolean(allowNameOnly),
      signed_up_count: signed,
      waitlist_count: waitlist,
    },
  });
}
