import { NextResponse } from "next/server";
import { AuthNotConfiguredError, AuthRequiredError } from "@/server/auth";
import { PaymentError } from "@/server/payments/settlement";

export function toErrorResponse(e: unknown) {
  if (e instanceof PaymentError || e instanceof AuthNotConfiguredError || e instanceof AuthRequiredError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[api]", e);
  return NextResponse.json({ error: "payment service unavailable" }, { status: 502 });
}
