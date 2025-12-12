import { NextResponse } from "next/server";

// post request caught here. 
export async function POST(req: Request) {
  const { code } = await req.json();
  const expected = process.env.ADMIN_DEV_CODE;
  if (!expected || code !== expected) {
    return new NextResponse("Invalid code", { status: 401 });
    }

  const res = new NextResponse(null, { status: 204 });
  // Cookie: 8 hours, HTTPOnly, Secure in prod, SameSite=Lax
  res.cookies.set("admin_dev", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}