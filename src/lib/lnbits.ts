import { randomBytes } from "crypto";

export interface WalletConn {
  url: string;
  adminKey: string;
}

const FAKE = process.env.DEV_FAKE_PAYMENTS === "true";

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

// fetch with a hard timeout — public LNbits instances (e.g. demo.lnbits.com) can
// hang, and we never want a slow wallet to wedge a request indefinitely.
async function fetchT(url: string, init: RequestInit, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Wallet server timed out — try again.");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Validate an issuer's LNbits connection and return its balance (sats).
 * Throws a friendly error if the URL/key is wrong or the server is unreachable.
 */
export async function getWalletInfo(conn: WalletConn): Promise<{ balanceSats: number }> {
  const base = normalize(conn.url);
  if (!/^https?:\/\//.test(base)) throw new Error("LNbits URL must start with http(s)://");
  let res: Response;
  try {
    res = await fetchT(`${base}/api/v1/wallet`, { headers: { "X-Api-Key": conn.adminKey } });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Could not reach the wallet server.");
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error("LNbits rejected that wallet. Double-check the URL and the Admin key.");
  }
  if (!res.ok) throw new Error(`Wallet check failed (HTTP ${res.status}).`);
  const body = (await res.json()) as { balance?: number };
  return { balanceSats: Math.floor((body.balance ?? 0) / 1000) };
}

/**
 * Create a one-time, fixed-amount LNbits Withdraw Link in the issuer's wallet,
 * using their admin key. Returns the PUBLIC lnurl + link id. The admin key is
 * used only for this call and is never returned or stored by the caller.
 *
 * The actual payout and one-time-use are then enforced by LNbits itself.
 */
export async function createWithdrawLink(
  conn: WalletConn,
  opts: { title: string; amountSats: number; webhookUrl: string }
): Promise<{ lnurl: string; linkId: string }> {
  const base = normalize(conn.url);
  const res = await fetchT(`${base}/withdraw/api/v1/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": conn.adminKey },
    body: JSON.stringify({
      title: opts.title,
      min_withdrawable: opts.amountSats,
      max_withdrawable: opts.amountSats,
      uses: 1,
      wait_time: 1,
      is_unique: true,
      webhook_url: opts.webhookUrl,
    }),
  });

  const text = await res.text();
  if (res.status === 404) {
    throw new Error(
      "Your LNbits doesn't have the 'Withdraw Links' extension enabled. Enable it in LNbits (Extensions → Withdraw Links), then try again."
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("LNbits rejected that Admin key for creating a withdraw link.");
  }
  if (!res.ok) {
    let reason = text;
    try { reason = JSON.parse(text).detail || text; } catch {}
    throw new Error(`Could not create the withdraw link (${res.status}): ${reason}`);
  }

  let body: { id?: string; lnurl?: string };
  try { body = JSON.parse(text); } catch { throw new Error("LNbits returned an unexpected response."); }
  if (!body.lnurl || !body.id) throw new Error("LNbits did not return a withdraw link.");
  return { lnurl: body.lnurl, linkId: body.id };
}

export interface PayResult {
  paymentHash: string;
  simulated: boolean;
}

/**
 * Simulated-mode payout only. In live mode, payouts are handled by the LNbits
 * withdraw link, not by this function.
 */
export async function payInvoice(_bolt11: string): Promise<PayResult> {
  if (FAKE) {
    return { paymentHash: "fake_" + randomBytes(16).toString("hex"), simulated: true };
  }
  throw new Error("Direct payInvoice is disabled in live mode (LNbits handles payouts).");
}

export const fakePaymentsEnabled = FAKE;
