import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/signout — form post from the account page; redirects home. */
export async function POST(req: Request) {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
