import { NextResponse } from "next/server";
import { setAdminCookie } from "@/lib/adminGuard";

export async function POST(req: Request) {
  const { code } = await req.json();
  const expected = process.env.ADMIN_DEV_CODE;

  if (!expected || code !== expected) {
    return new NextResponse("Invalid code", { status: 401 });
  }

  const res = new NextResponse(null, { status: 204 });
  setAdminCookie(res);

  return res;
}
