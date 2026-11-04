import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, OtpError, startSignIn } from "@/server/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ phone: z.string().min(5).max(32) });

/** POST /api/auth/start { phone } -> { challengeId, masked } and an SMS with a 6-digit code. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your mobile number" }, { status: 400 });
  try {
    return NextResponse.json(await startSignIn(parsed.data.phone, clientIp(req)));
  } catch (e) {
    if (e instanceof OtpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[auth:start]", e);
    return NextResponse.json({ error: "Sign-in is unavailable right now" }, { status: 500 });
  }
}
