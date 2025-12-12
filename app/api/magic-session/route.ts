import { NextResponse } from "next/server";

// TEMP: allowlist admins until you add real roles/RLS
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase());

export async function POST(req: Request) {
  const { email } = await req.json();

  // Minimal check (improve later with Supabase server verification)
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
    return new NextResponse("Not an admin", { status: 403 });
  }

  const res = new NextResponse(null, { status: 204 });
  // Set the same guard cookie your middleware already trusts
  res.cookies.set("admin_dev", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
