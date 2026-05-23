import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  bookingWindowOpensUtc,
  safeBookingWindowDays,
} from "@/lib/session-visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SignupRow = {
  status: "signed_up" | "waiting_list";
};

function visibilityMessage(days: number) {
  if (days === 1) return "Bookings open 1 day before the session starts.";
  return `Bookings open ${days} days before the session starts.`;
}

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

  const startIso = session.starts_at;
  if (!startIso) {
    return NextResponse.json({ error: "Session not available." }, { status: 404 });
  }

  const { data: settings } = await db
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  const sessionsPublicEnabled = settings?.sessions_public_enabled ?? true;
  if (!sessionsPublicEnabled) {
    return NextResponse.json(
      { error: "Session booking is currently hidden by the committee." },
      { status: 403 }
    );
  }

  const now = new Date();
  const safeDays = safeBookingWindowDays(settings?.booking_window_days);
  const end = new Date(session.ends_at ?? startIso);
  const visibilityOpensAt = bookingWindowOpensUtc(startIso, safeDays);

  if (end < now) {
    return NextResponse.json(
      { error: "Session is no longer available." },
      { status: 410 }
    );
  }

  if (now < visibilityOpensAt) {
    return NextResponse.json(
      { error: visibilityMessage(safeDays) },
      { status: 403 }
    );
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
