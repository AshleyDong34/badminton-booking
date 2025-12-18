import { NextResponse } from "next/server";
import { setAdminCookie } from "@/lib/adminGuard";

// TEMP: allowlist admins until you add real roles/RLS
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase());

export async function POST(req: Request) {
  const { email } = await req.json();

  // Minimal check (improve later with Supabase server verification)
  if (!email || !ADMIN_EMAILS.includes(String(email).toLowerCase())) {
    return new NextResponse("Not an admin", { status: 403 });
  }

  const res = new NextResponse(null, { status: 204 });
  setAdminCookie(res);

  return res;
}
