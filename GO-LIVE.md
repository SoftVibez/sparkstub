# Sparkstub — how to finish the live phone demo

The app is **built, tested, and working** (multi-issuer, no accounts). Everything below
is the *environmental* setup needed for a real phone to scan a voucher and receive sats.
None of it requires code changes.

> Do this on a **stable internet connection** (not a phone hotspot — the hotspot's DNS
> kept breaking the tunnel).

## 1. Start the app
```
cd sparkstub
npm run dev
```
Opens at http://localhost:3200

## 2. Give it a public address (so a phone can reach it)
A phone can't reach `localhost`. Open a free tunnel in a second terminal:
```
tools\cloudflared.exe tunnel --url http://localhost:3200
```
Copy the `https://....trycloudflare.com` URL it prints.

> ⚠️ This URL is random and only lasts while that window stays open. Each time you
> restart the tunnel you get a new URL and must redo step 3.

## 3. Point the app at that URL
Edit `.env`:
```
NEXT_PUBLIC_BASE_URL="https://....trycloudflare.com"   # the URL from step 2
```
Then stop the app (Ctrl+C) and `npm run dev` again so it picks up the change.

## 4. Fund a wallet (the money you'll give away)
The voucher pays out from whatever LNbits wallet you connect. That wallet needs a
balance. For your demo.lnbits.com wallet, pay a small top-up invoice into it (a few
hundred sats). You can generate one anytime from LNbits, or ask Claude to make one.

## 5. Mint a voucher
On http://localhost:3200:
1. **Connect your wallet** — paste your LNbits URL + **Admin key** (remembered in your browser)
2. **Mint a voucher** — label + amount (must be ≤ your wallet balance)
3. Open the voucher — you'll see the QR

## 6. Scan with a phone
Open any Lightning wallet on a phone (e.g. **Wallet of Satoshi**) → use its **Scan**
button on the voucher QR → confirm → the sats land in the phone. Scanning again is
rejected ("already claimed").

---

## Want the no-wallet demo instead?
Set `DEV_FAKE_PAYMENTS="true"` in `.env` and restart. Payouts are then simulated (no
wallet, no funding) and a **"Simulate wallet claim"** button appears on each voucher's
manage view. Run the test suite in this mode: `npm run test:flow` (14 checks).

## When you outgrow the tunnel (real public launch)
- Deploy to a host (Vercel, Railway, a VPS) for a permanent URL instead of a tunnel.
- Swap SQLite for a hosted database (e.g. Postgres) — serverless hosts don't keep SQLite files.
- **Security:** this version stores issuers' LNbits **admin keys** (encrypted at rest).
  That's full spending access. For a public service, switch to **Nostr Wallet Connect
  (NWC)** so users grant a *capped, revocable* budget instead of a full key.
