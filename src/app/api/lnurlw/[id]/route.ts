import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeBaseUrl } from "@/lib/lnurl";

export const dynamic = "force-dynamic";

// LUD-03 step 1: the wallet scans the QR, decodes the LNURL to this URL, and
// GETs it. We answer with a `withdrawRequest` describing the fixed payout and a
// single-use `k1`. The wallet then makes its own invoice and calls `callback`.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const voucher = await prisma.voucher.findUnique({ where: { id: params.id } });

  if (!voucher) {
    return NextResponse.json(
      { status: "ERROR", reason: "Voucher not found." },
      { status: 404 }
    );
  }

  // Record rejected scans here too, so a double-scan stopped at this step (the
  // common case once a voucher is spent) still shows up in the audit trail —
  // not only the concurrent races that reach the callback.
  const reject = async (outcome: string, reason: string) => {
    await prisma.redemptionAttempt.create({
      data: { voucherId: voucher.id, outcome, detail: `${reason} (at scan)` },
    });
    return NextResponse.json({ status: "ERROR", reason });
  };

  if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
    return reject("REJECTED_EXPIRED", "This voucher has expired.");
  }

  if (voucher.status === "REDEEMED" || voucher.status === "REDEEMING") {
    return reject("REJECTED_ALREADY", "This voucher has already been claimed.");
  }

  if (voucher.status !== "ACTIVE") {
    return reject("REJECTED_INVALID", "This voucher is not active.");
  }

  const base = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3200"
  );
  const msats = voucher.amountSats * 1000;

  // min == max forces the wallet to withdraw exactly the preset amount.
  return NextResponse.json({
    tag: "withdrawRequest",
    callback: `${base}/api/lnurlw/callback`,
    k1: voucher.k1,
    defaultDescription: voucher.title,
    minWithdrawable: msats,
    maxWithdrawable: msats,
  });
}
