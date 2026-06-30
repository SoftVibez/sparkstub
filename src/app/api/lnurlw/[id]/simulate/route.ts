import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fakePaymentsEnabled } from "@/lib/lnbits";

export const dynamic = "force-dynamic";

// Dev helper: play the role of a Lightning wallet against the callback on THIS
// host (using the request's own origin, so it never depends on the public
// tunnel URL). Only available in DEV_FAKE_PAYMENTS mode, since a real payout
// needs a real bolt11 the wallet would generate.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!fakePaymentsEnabled) {
    return NextResponse.json(
      { error: "Simulation is only available when DEV_FAKE_PAYMENTS=true." },
      { status: 400 }
    );
  }

  const voucher = await prisma.voucher.findUnique({ where: { id: params.id } });
  if (!voucher) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Call the real callback locally (same origin this request arrived on). In
  // fake mode the `pr` is never decoded, so a placeholder drives the claim path.
  const origin = req.nextUrl.origin;
  const fakeInvoice = "lnbc_simulated_" + voucher.k1.slice(0, 24);
  const cbUrl = new URL(`${origin}/api/lnurlw/callback`);
  cbUrl.searchParams.set("k1", voucher.k1);
  cbUrl.searchParams.set("pr", fakeInvoice);

  const cbRes = await fetch(cbUrl.toString(), { cache: "no-store" });
  const callbackResult = await cbRes.json();

  return NextResponse.json({ step: "callback", ...callbackResult });
}
