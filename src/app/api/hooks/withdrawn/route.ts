import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// LNbits calls this when an issuer's withdraw link is used (we set it as the
// link's webhook_url at creation). It carries our per-voucher `token` secret, so
// only LNbits can mark a voucher claimed. We never need a wallet key for this.
async function handle(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  const voucher = await prisma.voucher.findUnique({ where: { webhookSecret: token } });
  if (!voucher) return NextResponse.json({ ok: false }, { status: 404 });

  // Idempotent: only the first call flips ACTIVE -> REDEEMED.
  const res = await prisma.voucher.updateMany({
    where: { id: voucher.id, status: "ACTIVE" },
    data: { status: "REDEEMED", redeemedAt: new Date() },
  });
  if (res.count === 1) {
    await prisma.redemptionAttempt.create({
      data: { voucherId: voucher.id, outcome: "PAID", detail: "Withdrawn via LNbits link." },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
