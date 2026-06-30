import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateK1, voucherDisplayLinks, normalizeBaseUrl } from "@/lib/lnurl";
import { generateManageToken, generateWebhookSecret } from "@/lib/crypto";
import { getWalletInfo, createWithdrawLink, fakePaymentsEnabled } from "@/lib/lnbits";

export const dynamic = "force-dynamic";

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3200");

// No "list all vouchers" endpoint by design — this is a no-accounts, multi-issuer
// app; each browser tracks its own vouchers (id + manageToken) locally.

// POST /api/vouchers — mint a voucher.
// Live mode: use the issuer's admin key ONCE to create a one-time LNbits withdraw
// link, then discard the key (never stored). Only the public lnurl is kept.
export async function POST(req: NextRequest) {
  let body: {
    title?: string;
    amountSats?: number;
    expiresInHours?: number;
    lnbitsUrl?: string;
    lnbitsAdminKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = (body.title || "").trim() || "Lightning voucher";
  const amountSats = Math.floor(Number(body.amountSats));
  if (!Number.isFinite(amountSats) || amountSats <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number of sats." }, { status: 400 });
  }
  if (amountSats > 1_000_000) {
    return NextResponse.json({ error: "Amount cannot exceed 1,000,000 sats (safety cap)." }, { status: 400 });
  }

  let expiresAt: Date | null = null;
  if (body.expiresInHours && Number(body.expiresInHours) > 0) {
    expiresAt = new Date(Date.now() + Number(body.expiresInHours) * 3600_000);
  }

  const manageToken = generateManageToken();
  const webhookSecret = generateWebhookSecret();

  let lnbitsLnurl: string | null = null;
  let lnbitsLinkId: string | null = null;

  if (!fakePaymentsEnabled) {
    const url = (body.lnbitsUrl || "").trim();
    const adminKey = (body.lnbitsAdminKey || "").trim();
    if (!url || !adminKey) {
      return NextResponse.json(
        { error: "Connect your LNbits wallet (URL + Admin key) to fund this voucher." },
        { status: 400 }
      );
    }

    // 1) Sanity-check the wallet + balance.
    let info: { balanceSats: number };
    try {
      info = await getWalletInfo({ url, adminKey });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not validate that wallet." }, { status: 400 });
    }
    if (info.balanceSats < amountSats) {
      return NextResponse.json(
        { error: `Your wallet has ${info.balanceSats} sats — not enough to fund a ${amountSats}-sat voucher.` },
        { status: 400 }
      );
    }

    // 2) Create the one-time withdraw link IN their LNbits, then forget the key.
    const webhookUrl = `${BASE}/api/hooks/withdrawn?token=${webhookSecret}`;
    try {
      const link = await createWithdrawLink({ url, adminKey }, { title, amountSats, webhookUrl });
      lnbitsLnurl = link.lnurl;
      lnbitsLinkId = link.linkId;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create the withdraw link." }, { status: 400 });
    }
    // NOTE: `adminKey` goes out of scope here and is never persisted.
  }

  const voucher = await prisma.voucher.create({
    data: {
      title,
      amountSats,
      k1: generateK1(),
      manageToken,
      webhookSecret,
      lnbitsLnurl,
      lnbitsLinkId,
      expiresAt,
    },
  });

  return NextResponse.json(
    {
      id: voucher.id,
      title: voucher.title,
      amountSats: voucher.amountSats,
      status: voucher.status,
      expiresAt: voucher.expiresAt,
      manageToken,
      ...voucherDisplayLinks(BASE, voucher.id, voucher.lnbitsLnurl),
    },
    { status: 201 }
  );
}
