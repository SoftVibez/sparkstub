import { NextResponse } from "next/server";
import { fakePaymentsEnabled } from "@/lib/lnbits";

export const dynamic = "force-dynamic";

// Surfaces non-secret runtime flags the UI needs (e.g. whether to show the
// "Simulate wallet claim" button).
export async function GET() {
  return NextResponse.json({ fakePayments: fakePaymentsEnabled });
}
