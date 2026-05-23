import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

function todayInLondon() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function GET() {
  const db = supabaseServer();
  const { data, error } = await db
    .from("events")
    .select(
      "id,title,body,link_label,link_url,image_url,image_alt,image_side,expires_on,sort_order"
    )
    .eq("is_active", true)
    .or(`expires_on.is.null,expires_on.gte.${todayInLondon()}`)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    const missingEventsTable =
      error.message.includes("events") || error.message.includes("schema cache");
    if (missingEventsTable) {
      return NextResponse.json({ events: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
