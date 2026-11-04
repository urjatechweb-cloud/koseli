import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { refreshRates } from "@/server/fx/fx-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cron/fx — daily NRB refresh. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await refreshRates());
  } catch (e) {
    console.error("[cron:fx]", e);
    return NextResponse.json({ error: "all providers failed" }, { status: 502 });
  }
}
