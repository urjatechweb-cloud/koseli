import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/auth";
import { demoPaymentsEnabled } from "@/server/orders";
import { markSucceeded, newReference } from "@/server/payments/settlement";
import { toErrorResponse } from "../fonepay/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ orderId: z.string().min(1).max(64) });

/**
 * POST /api/payments/demo — simulated payment for demos and testing.
 * Refuses unless DEMO_PAYMENTS=true. Never enable it where real customers can reach the site.
 */
export async function POST(req: Request) {
  if (!demoPaymentsEnabled()) return NextResponse.json({ error: "demo payments are off" }, { status: 404 });
  try {
    const userId = await requireUserId(req);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, userId, status: "PENDING_PAYMENT" },
      select: { id: true, totalMinor: true },
    });
    if (!order) return NextResponse.json({ error: "order not found or already paid" }, { status: 404 });
    const reference = newReference();
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "DEMO",
        status: "PENDING",
        reference,
        amountMinor: order.totalMinor,
        settlementNprMinor: order.totalMinor,
      },
    });
    await markSucceeded(reference, `demo_${reference}`, { demo: true });
    return NextResponse.json({ status: "SUCCEEDED" });
  } catch (e) {
    return toErrorResponse(e);
  }
}
