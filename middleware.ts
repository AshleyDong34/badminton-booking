import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";


export const config = {
matcher: ["/admin/:path*"],
};


export function middleware(req: NextRequest) {
const url = new URL(req.url);
const hasDev = req.cookies.get("admin_dev")?.value === "1";


// TODO: extend with Supabase server session check later
if (!hasDev) {
url.pathname = "/signin";
return NextResponse.redirect(url);
}
return NextResponse.next();
}