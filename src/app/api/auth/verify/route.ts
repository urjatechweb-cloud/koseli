import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId, setSessionCookie } from "@/server/auth";
import { OtpError, verifySignIn } from "@/server/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ challengeId: z.string().uuid(), code: z.string().trim().max(10) });

/** POST /api/auth/verify { challengeId, code } -> signs in (sets a fresh session cookie). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That code is wrong or has expired" }, { status: 400 });
  try {
    const userId = await verifySignIn(parsed.data.challengeId, parsed.data.code.replace(/\s/g, ""), getSessionUserId());
    setSessionCookie(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OtpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[auth:verify]", e);
    return NextResponse.json({ error: "Sign-in is unavailable right now" }, { status: 500 });
  }
}
