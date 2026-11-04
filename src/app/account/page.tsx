import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { maskPhone } from "@/server/sms/phone";
import { rs } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account" };

const LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Waiting for payment",
  PAID: "Paid",
  FULFILLING: "Being prepared",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user?.signedIn) redirect("/signin?next=/account");

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      number: true,
      status: true,
      totalMinor: true,
      deliverOn: true,
      recipientName: true,
      items: { select: { quantity: true, product: { select: { title: true } } }, take: 3 },
    },
  });

  return (
    <main className="wrap grid gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-4xl">Your orders</h1>
          <p className="text-sm text-muted">Signed in as <span className="font-mono">{user.phone ? maskPhone(user.phone) : ""}</span></p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="btn-ghost" type="submit">Sign out</button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-line p-8">
          <p className="font-semibold">No orders yet.</p>
          <Link href="/shop" className="btn-primary">Send your first koseli</Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="grid gap-2 rounded-xl border border-line bg-surface p-4 hover:border-marigold sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  <p className="text-sm">
                    <span className="font-mono font-semibold">{o.number}</span>
                    <span className="text-muted"> · to {o.recipientName ?? "recipient"}
                      {o.deliverOn ? ` on ${o.deliverOn.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}</span>
                  </p>
                  <p className="truncate text-sm text-muted">{o.items.map((i) => `${i.quantity} × ${i.product.title}`).join(", ")}</p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="rounded-full bg-marigold-soft px-3 py-1 text-xs font-semibold">{LABEL[o.status] ?? o.status}</span>
                  <span className="whitespace-nowrap font-mono tabular-nums">{rs(o.totalMinor)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
