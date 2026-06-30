import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { payInvoice } from "@/lib/lnbits";

export const dynamic = "force-dynamic";

// NOTE: This endpoint backs Sparkstub's OWN LNURL flow, used only in simulated/
// dev mode. In live mode the QR points at the issuer's LNbits withdraw link, and
// LNbits handles the payout + one-time-use directly (this route isn't involved).

// LNURL wants `{status:"OK"}` / `{status:"ERROR", reason}` and HTTP 200 either way.
function ok(body: Record<string, unknown>) {
  return NextResponse.json(body, { status: 200 });
}

async function logAttempt(voucherId: string | null, outcome: string, detail?: string) {
  await prisma.redemptionAttempt.create({
    data: { voucherId: voucherId ?? undefined, outcome, detail },
  });
}

export async function GET(req: NextRequest) {
  const k1 = req.nextUrl.searchParams.get("k1") || "";
  const pr = req.nextUrl.searchParams.get("pr") || "";

  if (!k1 || !pr) return ok({ status: "ERROR", reason: "Missing k1 or pr." });

  const voucher = await prisma.voucher.findUnique({ where: { k1 } });
  if (!voucher) {
    await logAttempt(null, "REJECTED_INVALID", "Unknown k1.");
    return ok({ status: "ERROR", reason: "Invalid withdraw link." });
  }

  if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
    await prisma.voucher.updateMany({ where: { id: voucher.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    await logAttempt(voucher.id, "REJECTED_EXPIRED", "Past expiry.");
    return ok({ status: "ERROR", reason: "This voucher has expired." });
  }

  // --- Atomic one-time-use claim: flip ACTIVE -> REDEEMING only if still ACTIVE.
  const claim = await prisma.voucher.updateMany({
    where: { id: voucher.id, status: "ACTIVE" },
    data: { status: "REDEEMING" },
  });
  if (claim.count !== 1) {
    await logAttempt(voucher.id, "REJECTED_ALREADY", `Lost claim race; status was '${voucher.status}'.`);
    return ok({ status: "ERROR", reason: "This voucher has already been claimed." });
  }

  try {
    const { simulated } = await payInvoice(pr);
    await prisma.voucher.update({
      where: { id: voucher.id },
      data: { status: "REDEEMED", redeemedAt: new Date() },
    });
    await logAttempt(voucher.id, "PAID", simulated ? "Simulated payout." : "Paid.");
    return ok({ status: "OK" });
  } catch (err) {
    await prisma.voucher.updateMany({ where: { id: voucher.id, status: "REDEEMING" }, data: { status: "ACTIVE" } });
    const reason = err instanceof Error ? err.message : "Payout failed.";
    await logAttempt(voucher.id, "ERROR_PAYMENT", reason);
    return ok({ status: "ERROR", reason });
  }
}
