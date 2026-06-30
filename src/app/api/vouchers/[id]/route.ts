import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { voucherDisplayLinks, normalizeBaseUrl } from "@/lib/lnurl";

export const dynamic = "force-dynamic";

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3200");

// GET /api/vouchers/[id]            -> public ticket info (anyone with the link)
// GET /api/vouchers/[id]?manage=TOK -> also includes claim attempts (owner only)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const manage = req.nextUrl.searchParams.get("manage");
  const voucher = await prisma.voucher.findUnique({
    where: { id: params.id },
    include: { attempts: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!voucher) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const isOwner = !!manage && manage === voucher.manageToken;

  const publicView = {
    id: voucher.id,
    title: voucher.title,
    amountSats: voucher.amountSats,
    status: voucher.status,
    expiresAt: voucher.expiresAt,
    redeemedAt: voucher.redeemedAt,
    isOwner,
    ...voucherDisplayLinks(BASE, voucher.id, voucher.lnbitsLnurl),
  };

  if (!isOwner) return NextResponse.json(publicView);

  return NextResponse.json({
    ...publicView,
    attempts: voucher.attempts,
  });
}

// DELETE /api/vouchers/[id]?manage=TOK — void a voucher (owner only).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const manage = req.nextUrl.searchParams.get("manage");
  const voucher = await prisma.voucher.findUnique({ where: { id: params.id } });
  if (!voucher) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!manage || manage !== voucher.manageToken) {
    return NextResponse.json({ error: "Not authorized to void this voucher." }, { status: 403 });
  }
  await prisma.redemptionAttempt.deleteMany({ where: { voucherId: params.id } });
  await prisma.voucher.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
