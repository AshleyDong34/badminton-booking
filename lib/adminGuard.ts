import type { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "admin_dev";

/** Read guard cookie */
export function isAdmin(req: NextRequest) {
  return req.cookies.get(ADMIN_COOKIE_NAME)?.value === "1";
}

/** Set guard cookie on a response */
export function setAdminCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
}
