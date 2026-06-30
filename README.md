# ⚡ Sparkstub — Withdraw-Linked QR Codes (LNURL-withdraw)

Mint a printable/scannable QR code that lets **any** Lightning wallet withdraw a
**preset amount of sats** — physical gift cards, conference giveaways, ATM-style
payouts. Each voucher is **one-time-use**: redemption is guarded against double
spending.

Built with **Next.js (App Router) · Prisma · SQLite · LNbits**.

---

## How it works (LNURL-withdraw / LUD-03)

```
1. Sparkstub encodes  https://host/api/lnurlw/<id>  as an lnurl1… string → QR.
2. Wallet scans, decodes, GETs that URL.
3. Server returns a withdrawRequest:  { tag, callback, k1, min/maxWithdrawable }.
   (min == max == amount, so the wallet must take exactly the preset sats.)
4. Wallet makes its own invoice and calls  callback?k1=<k1>&pr=<bolt11>.
5. Server atomically claims k1, pays the invoice via LNbits, returns {status:"OK"}.
```

### One-time-use security

The anti-double-redemption guarantee is one atomic conditional write in
[`callback/route.ts`](src/app/api/lnurlw/callback/route.ts):

```ts
// flip ACTIVE -> REDEEMING only if still ACTIVE
const claim = await prisma.voucher.updateMany({
  where: { id, status: "ACTIVE" },
  data:  { status: "REDEEMING" },
});
if (claim.count !== 1) return ERROR("already claimed");
```

Of any number of racing callbacks, exactly one sees `count === 1`; the rest are
rejected. The voucher stays `REDEEMING` across the payout (so an in-flight retry
can't double-pay), then becomes `REDEEMED`. If the LNbits payment throws, the
claim is released back to `ACTIVE` for a legitimate retry. Every attempt is
written to a `RedemptionAttempt` audit log, visible on the voucher page.

---

## Quick start

```bash
npm install
cp .env.example .env        # defaults work for simulated local testing
npm run db:setup            # prisma db push + generate
npm run dev                 # http://localhost:3200
```

Out of the box `DEV_FAKE_PAYMENTS="true"` → payouts are **simulated** (no real
node, no real sats), so you can exercise the whole flow immediately. Open a
voucher and click **Simulate wallet claim** (click twice to see the one-time-use
rejection).

### End-to-end test

With the dev server running in fake mode:

```bash
npm run test:flow
```

Asserts happy-path withdraw, second-claim rejection, an 8-way concurrent
double-spend race (exactly one wins), and invalid-link rejection.

---

## Going live with LNbits + a real wallet

1. In your LNbits wallet, copy the **Admin key** of the funding wallet.
2. Set in `.env`:
   ```
   DEV_FAKE_PAYMENTS="false"
   LNBITS_URL="https://your-lnbits-instance"
   LNBITS_ADMIN_KEY="<admin key>"
   NEXT_PUBLIC_BASE_URL="https://<your-public-https-url>"
   ```
3. `NEXT_PUBLIC_BASE_URL` **must be reachable by the scanning phone**. For local
   testing expose the dev server with a tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3200
   ```
   then put the `https://…trycloudflare.com` URL in `NEXT_PUBLIC_BASE_URL` and
   restart. Phone wallets can't reach `localhost`.
4. Restart, mint a voucher, scan the QR with a real wallet (Phoenix, Zeus,
   Breez, Wallet of Satoshi, etc.).

---

## Project map

| Path | Role |
|------|------|
| [`src/lib/lnurl.ts`](src/lib/lnurl.ts) | bech32 `lnurl1…` encode/decode, k1 generation |
| [`src/lib/lnbits.ts`](src/lib/lnbits.ts) | LNbits payout client (+ fake-mode) |
| [`src/app/api/lnurlw/[id]/route.ts`](src/app/api/lnurlw/[id]/route.ts) | `withdrawRequest` endpoint |
| [`src/app/api/lnurlw/callback/route.ts`](src/app/api/lnurlw/callback/route.ts) | callback + atomic one-time-use claim |
| [`src/app/api/vouchers`](src/app/api/vouchers) | create / list / get / void |
| [`src/app/page.tsx`](src/app/page.tsx) | mint + manage dashboard |
| [`src/app/v/[id]/page.tsx`](src/app/v/[id]/page.tsx) | printable ticket, live status, audit log |
| [`scripts/test-flow.ts`](scripts/test-flow.ts) | e2e flow + security test |

## Notes / scope

- SQLite serializes writes, which is what makes the conditional `updateMany`
  a reliable claim lock here. For Postgres/MySQL the same pattern holds (the
  `WHERE status='ACTIVE'` row update is atomic); under heavy concurrency you may
  add `SELECT … FOR UPDATE` or a unique partial index for belt-and-braces.
- Amounts are fixed per voucher (`min == max`). Range vouchers would be a small
  change to the `withdrawRequest`.
