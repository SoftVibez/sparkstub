"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Attempt {
  id: string;
  outcome: string;
  detail: string | null;
  createdAt: string;
}
interface Voucher {
  id: string;
  title: string;
  amountSats: number;
  status: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  isOwner: boolean;
  lnurl: string;
  lightningUri: string;
  requestUrl: string | null;
  attempts?: Attempt[];
}

const fmt = new Intl.NumberFormat("en-US");

export default function VoucherPage({ params }: { params: { id: string } }) {
  const [v, setV] = useState<Voucher | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manageToken, setManageToken] = useState<string | null>(null);
  const [fakeMode, setFakeMode] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simMsg, setSimMsg] = useState("");

  // read the (optional) manage token from the URL once on mount
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("manage");
    setManageToken(t);
    fetch("/api/config").then((r) => r.json()).then((c) => setFakeMode(!!c.fakePayments)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const q = manageToken ? `?manage=${manageToken}` : "";
    const res = await fetch(`/api/vouchers/${params.id}${q}`, { cache: "no-store" });
    if (res.status === 404) { setNotFound(true); return; }
    setV(await res.json());
  }, [params.id, manageToken]);

  useEffect(() => { load(); }, [load]);

  // live-poll while still claimable
  useEffect(() => {
    if (!v || v.status === "REDEEMED" || v.status === "EXPIRED") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [v, load]);

  async function copy() {
    if (!v) return;
    await navigator.clipboard.writeText(v.lnurl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function simulate() {
    setSimulating(true);
    setSimMsg("");
    try {
      const res = await fetch(`/api/lnurlw/${params.id}/simulate`, { method: "POST" });
      const data = await res.json();
      setSimMsg(data.status === "OK" ? "✅ Wallet withdrew successfully." : `⛔ ${data.reason || data.error || "Rejected."}`);
      await load();
    } finally {
      setSimulating(false);
    }
  }

  if (notFound) {
    return (<div className="wrap"><p className="empty">Voucher not found.</p><Link href="/">← Back</Link></div>);
  }
  if (!v) {
    return (<div className="wrap"><p className="empty">Loading…</p></div>);
  }

  const qrSrc = `/api/qr?data=${encodeURIComponent(v.lightningUri)}`;

  return (
    <div className="wrap">
      <header className="masthead no-print">
        <div>
          <div className="kicker">Withdraw voucher</div>
          <div className="brand">Spark<span className="bolt">stub</span></div>
        </div>
        <Link href="/">← Home</Link>
      </header>

      <div className="grid">
        {/* The scannable ticket — public */}
        <section className="ticket">
          <div className="denomination">{fmt.format(v.amountSats)} <small>SATS</small></div>
          <div className="note" style={{ fontStyle: "normal", marginTop: 4 }}>{v.title}</div>
          <div className="qrbox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="LNURL-withdraw QR code" />
          </div>
          <div><span className={`pill ${v.status.toLowerCase()}`}>{v.status}</span></div>
          <p className="serial mono">{v.lnurl}</p>
          <p className="note">Scan with any Lightning wallet to withdraw.</p>
        </section>

        {/* Right column: minimal for public, full controls for owner */}
        <section className="panel no-print">
          {!v.isOwner ? (
            <>
              <h2 className="section">How to claim</h2>
              <ol className="note" style={{ fontStyle: "normal", lineHeight: 1.8, paddingLeft: 18 }}>
                <li>Open any Lightning wallet on your phone.</li>
                <li>Use its <b>Scan</b> button on the QR (or copy the code below).</li>
                <li>Confirm — {fmt.format(v.amountSats)} sats arrive in your wallet.</li>
              </ol>
              <label>LNURL</label>
              <div className="copyfield">
                <input className="mono" readOnly value={v.lnurl} />
                <button className="btn-ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="section">Manage</h2>
              <p className="note" style={{ marginTop: -6 }}>
                You&apos;re viewing the private owner controls for this voucher.
              </p>

              <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={() => window.print()}>🖨 Print</button>
                <button className="btn-ghost" onClick={copy}>{copied ? "Copied LNURL" : "Copy LNURL"}</button>
                {fakeMode && (
                  <button className="btn-brass" onClick={simulate} disabled={simulating}>
                    {simulating ? "Simulating…" : "Simulate wallet claim"}
                  </button>
                )}
              </div>
              {simMsg && <p className="note" style={{ fontStyle: "normal", marginTop: 10 }}>{simMsg}</p>}

              <h2 className="section" style={{ marginTop: 26 }}>Redemption attempts</h2>
              {!v.attempts || v.attempts.length === 0 ? (
                <p className="empty">No attempts yet.</p>
              ) : (
                v.attempts.map((a) => (
                  <div className="attempt" key={a.id}>
                    <span className={`outcome mono ${a.outcome}`}>{a.outcome}</span>
                    <span className="note" style={{ flex: 1, textAlign: "left" }}>{a.detail}</span>
                    <span className="note">{new Date(a.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
