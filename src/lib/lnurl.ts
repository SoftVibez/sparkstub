import { bech32 } from "bech32";
import { randomBytes } from "crypto";

// LNURL bech32 uses the "lnurl" human-readable part and, unlike on-chain
// addresses, has no practical length cap — so we pass a generous limit.
const LNURL_LIMIT = 1023;

/** Encode an https URL as a bech32 `lnurl1...` string (LUD-01). */
export function encodeLnurl(url: string): string {
  const words = bech32.toWords(Buffer.from(url, "utf8"));
  return bech32.encode("lnurl", words, LNURL_LIMIT).toUpperCase();
}

/** Decode an `lnurl1...` string back to its target URL. */
export function decodeLnurl(lnurl: string): string {
  const { words } = bech32.decode(lnurl.toLowerCase(), LNURL_LIMIT);
  return Buffer.from(bech32.fromWords(words)).toString("utf8");
}

/** Fresh 32-byte single-use secret (hex), per LUD-03. */
export function generateK1(): string {
  return randomBytes(32).toString("hex");
}

/** Strip a trailing slash so we never produce `//api/...`. */
export function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/**
 * Build everything a voucher needs to be scanned:
 * - the withdrawRequest endpoint URL the QR points at,
 * - the bech32 LNURL string,
 * - a `lightning:` URI (what most wallet deep-links / QR scanners expect).
 */
export function buildVoucherLinks(baseUrl: string, voucherId: string) {
  const base = normalizeBaseUrl(baseUrl);
  const requestUrl = `${base}/api/lnurlw/${voucherId}`;
  const lnurl = encodeLnurl(requestUrl);
  return {
    requestUrl,
    lnurl,
    lightningUri: `lightning:${lnurl}`,
  };
}

/**
 * The LNURL a voucher's QR should encode:
 * - live mode  -> the public LNURL minted in the issuer's LNbits,
 * - dev mode   -> Sparkstub's own withdrawRequest LNURL.
 */
export function voucherDisplayLinks(
  baseUrl: string,
  voucherId: string,
  lnbitsLnurl?: string | null
) {
  if (lnbitsLnurl) {
    const lnurl = lnbitsLnurl.toUpperCase();
    return { lnurl, lightningUri: `lightning:${lnurl}`, requestUrl: null as string | null };
  }
  return buildVoucherLinks(baseUrl, voucherId);
}
