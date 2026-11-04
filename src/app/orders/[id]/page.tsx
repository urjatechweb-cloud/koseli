import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUserId } from "@/server/auth";
import { demoPaymentsEnabled, getOrderForUser } from "@/server/orders";
import { PayPanel } from "@/components/pay-panel";
import { rs } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your order" };

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Waiting for payment", tone: "bg-marigold-soft" },
  PAID: { label: "Paid · being prepared", tone: "bg-leaf-soft" },
  FULFILLING: { label: "Being prepared", tone: "bg-leaf-soft" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", tone: "bg-leaf-soft" },
  DELIVERED: { label: "Delivered", tone: "bg-leaf-soft" },
  CANCELLED: { label: "Cancelled", tone: "bg-gurans-soft" },
  REFUNDED: { label: "Refunded", tone: "bg-gurans-soft" },
};

export default async function OrderPage({ params, searchParams }: { params: { id: string }; searchParams: { payment?: string } }) {
  const userId = getSessionUserId();
  const order = userId ? await getOrderForUser(params.id, userId) : null;

  if (!order) {
    return (
      <main className="wrap grid justify-items-start gap-3 py-10">
        <h1 className="font-display text-4xl">Order not found</h1>
        <p className="text-muted">Sign in with the phone number you used, or open this page on the device you ordered from.</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/signin?next=/orders/${encodeURIComponent(params.id)}`} className="btn-primary">Sign in</Link>
          <Link href="/shop" className="btn-ghost">Back to gifts</Link>
        </div>
      </main>
    );
  }

  const st = STATUS[order.status] ?? { label: order.status, tone: "bg-surface" };
  const paid = order.payments[0];
  const addr = order.deliveryAddress;

  return (
    <main className="wrap grid gap-8 py-10 lg:grid-cols-[1fr_380px]">
      <div className="grid content-start gap-6">
        <div className="grid gap-2">
          <p className="eyebrow">Order <span className="font-mono">{order.number}</span></p>
          <h1 className="font-display text-4xl">
            {order.status === "PENDING_PAYMENT" ? "Almost there" : `Thank you, ${order.senderName ?? "friend"}`}
          </h1>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${st.tone}`}>{st.label}</span>
          {searchParams.payment === "failed" && order.status === "PENDING_PAYMENT" && (
            <p role="alert" className="rounded-lg bg-gurans-soft p-3 text-sm">That payment didn't go through. Nothing was charged. Try again below.</p>
          )}
        </div>

        <section className="grid gap-3 rounded-xl border border-line bg-surface p-5 text-sm">
          <h2 className="font-semibold">Delivery</h2>
          <p>
            To <strong>{order.recipientName}</strong> ({order.recipientPhone}) on{" "}
            <strong>{order.deliverOn?.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</strong>
          </p>
          {addr && (
            <p className="text-muted">
              {addr.line1}
              {addr.ward ? `, ward ${addr.ward}` : ""}, {addr.city.name}
              {addr.landmark ? ` · near ${addr.landmark}` : ""}
            </p>
          )}
          {order.giftMessage && <blockquote className="border-l-2 border-marigold pl-3 italic">“{order.giftMessage}”</blockquote>}
        </section>

        <section className="grid gap-2 rounded-xl border border-line bg-surface p-5 text-sm">
          <h2 className="mb-1 font-semibold">Items</h2>
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-3">
              <span>{i.quantity} × {i.product.title}</span>
              <span className="shrink-0 whitespace-nowrap font-mono tabular-nums">{rs(i.unitRetailMinor * i.quantity)}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-line pt-2"><span className="text-muted">Delivery</span><span className="font-mono tabular-nums">{rs(order.deliveryFeeMinor)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="font-mono tabular-nums">{rs(order.totalMinor)}</span></div>
          {paid && <p className="text-muted">Paid {paid.provider === "DEMO" ? "(demo payment)" : `via ${paid.provider.replace("_", " ").toLowerCase()}`}.</p>}
        </section>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <PayPanel
          orderId={order.id}
          totalMinor={order.totalMinor}
          demoEnabled={demoPaymentsEnabled()}
          stripeKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null}
        />
      )}
    </main>
  );
}
