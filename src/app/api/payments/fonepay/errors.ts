import { NextResponse } from "next/server";
import { AuthNotConfiguredError } from "@/server/auth";
import { PaymentError } from "@/server/payments/payment-service";

export function toErrorResponse(e: unknown) {
  if (e instanceof PaymentError || e instanceof AuthNotConfiguredError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[fonepay]", e);
  return NextResponse.json({ error: "payment service unavailable" }, { status: 502 });
}
