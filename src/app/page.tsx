"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface LocalVoucher {
  id: string;
  manageToken: string;
  title: string;
  amountSats: number;
  createdAt: string;
}
interface Status {
  status: string;
}

const fmt = new Intl.NumberFormat("en-US");
const LS_CONN = "sparkstub.conn";
const LS_VOUCHERS = "sparkstub.vouchers";
const DEFAULT_URL = process.env.NEXT_PUBLIC_DEFAULT_LNBITS_URL || "https://demo.lnbits.com";

export default function Home() {
  const [fakeMode, setFakeMode] = useState<boolean | null>(null);

  // wallet connection (issuer's own LNbits)
  const [lnUrl, setLnUrl] = useState(DEFAULT_URL);
  const [lnKey, setLnKey] = useState("");
  const [remember, setRemember] = useState(true);

  // create form
  const [title, setTitle] = useState("Conference giveaway");
  const [amount, setAmount] = useState("100");
  const [expires, setExpires] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<LocalVoucher | null>(null);

  // local list
  const [vouchers, setVouchers] = useState<LocalVoucher[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  // load config + remembered connection + local vouchers
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setFakeMode(!!c.fakePayments))
      .catch(() => setFakeMode(false));
    try {
      const conn = JSON.parse(localStorage.getItem(LS_CONN) || "null");
      if (conn?.url) setLnUrl(conn.url);
      if (conn?.adminKey) setLnKey(conn.adminKey);
    } catch {}
    try {
      const list = JSON.parse(localStorage.getItem(LS_VOUCHERS) || "[]");
      if (Array.isArray(list)) setVouchers(list);
    } catch {}
  }, []);

  const refreshStatuses = useCallback(async (list: LocalVoucher[]) => {
    const next: Record<string, string> = {};
    await Promise.all(
      list.map(async (v) => {
        try {
          const r = await fetch(`/api/vouchers/${v.id}?manage=${v.manageToken}`, { cache: "no-store" });
          if (r.status === 404) { next[v.id] = "DELETED"; return; }
          const d: Status = await r.json();
          next[v.id] = d.status;
        } catch {
          next[v.id] = "?";
        }
      })
    );
    setStatuses(next);
  }, []);

  useEffect(() => {
    if (vouchers.length) refreshStatuses(vouchers);
  }, [vouchers, refreshStatuses]);

  function persistVouchers(list: LocalVoucher[]) {
    setVouchers(list);
    localStorage.setItem(LS_VOUCHERS, JSON.stringify(list));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setJustCreated(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          amountSats: Number(amount),
          expiresInHours: Number(expires),
          lnbitsUrl: lnUrl,
          lnbitsAdminKey: lnKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create voucher.");
        return;
      }
      // remember the wallet connection if asked
      if (!fakeMode) {
        if (remember) localStorage.setItem(LS_CONN, JSON.stringify({ url: lnUrl, adminKey: lnKey }));
        else localStorage.removeItem(LS_CONN);
      }
      const lv: LocalVoucher = {
        id: data.id,
        manageToken: data.manageToken,
        title: data.title,
        amountSats: data.amountSats,
        createdAt: new Date().toISOString(),
      };
      persistVouchers([lv, ...vouchers]);
      setJustCreated(lv);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(v: LocalVoucher) {
    if (!confirm("Void this voucher permanently?")) return;
    await fetch(`/api/vouchers/${v.id}?manage=${v.manageToken}`, { method: "DELETE" });
    persistVouchers(vouchers.filter((x) => x.id !== v.id));
  }

  function forget(v: LocalVoucher) {
    persistVouchers(vouchers.filter((x) => x.id !== v.id));
  }

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <div className="kicker">LNURL-withdraw · LUD-03</div>
          <div className="brand">
            Spark<span className="bolt">stub</span>
          </div>
        </div>
        <div className="tagline">
          Connect your wallet. Mint a stub. Anyone scans it and withdraws preset sats — once.
        </div>
      </header>

      <div className="banner">
        ⚡ Each voucher is funded by <b>your own</b> Lightning wallet and can be claimed once by{" "}
        <b>anyone</b> with any wallet. Your vouchers are remembered in this browser only.
      </div>

      <div className="grid">
        <section className="panel">
          {!fakeMode && (
            <>
              <h2 className="section">1 · Connect your wallet</h2>
              <p className="note" style={{ marginTop: -6 }}>
                Your LNbits wallet funds the vouchers you create. The Admin key is used
                <b> once</b> to create a withdraw link in your LNbits, then discarded —
                never saved on the server. Kept in this browser so you don&apos;t retype it.
                Needs the <b>Withdraw Links</b> extension enabled in LNbits.
              </p>
              <label htmlFor="lnurl">LNbits URL</label>
              <input id="lnurl" className="mono" value={lnUrl} onChange={(e) => setLnUrl(e.target.value)} />
              <label htmlFor="lnkey">LNbits Admin key</label>
              <input
                id="lnkey"
                className="mono"
                type="password"
                placeholder="admin key (the spending one)"
                value={lnKey}
                onChange={(e) => setLnKey(e.target.value)}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember on this device
              </label>
            </>
          )}

          <h2 className="section" style={{ marginTop: fakeMode ? 0 : 26 }}>
            {fakeMode ? "Mint a voucher" : "2 · Mint a voucher"}
          </h2>
          {fakeMode && (
            <p className="note" style={{ marginTop: -6 }}>
              Simulated mode: no wallet needed — payouts are faked for demoing the flow.
            </p>
          )}
          <form onSubmit={create}>
            <label htmlFor="title">Label</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />

            <label htmlFor="amount">Amount (sats)</label>
            <input id="amount" className="mono" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />

            <label htmlFor="expires">Expires in (hours, 0 = never)</label>
            <input id="expires" className="mono" inputMode="numeric" value={expires} onChange={(e) => setExpires(e.target.value)} />

            {error && (
              <p className="note" style={{ color: "var(--bad)" }}>
                {error}
              </p>
            )}

            <div style={{ marginTop: 18 }}>
              <button className="btn-primary" disabled={submitting} type="submit">
                {submitting ? "Minting…" : "Mint voucher"}
              </button>
            </div>
          </form>

          {justCreated && (
            <div className="banner" style={{ marginTop: 18 }}>
              ✅ Created <b>{justCreated.title}</b> — {fmt.format(justCreated.amountSats)} sats.
              <br />
              <Link href={`/v/${justCreated.id}`}>Open the public ticket →</Link>
              <br />
              <span className="note">
                Private manage link (keep it): <Link href={`/v/${justCreated.id}?manage=${justCreated.manageToken}`}>open manage view</Link>
              </span>
            </div>
          )}
        </section>

        <section className="panel">
          <h2 className="section">
            Your vouchers {vouchers.length > 0 && `(${vouchers.length})`}
          </h2>
          {vouchers.length === 0 ? (
            <p className="empty">No vouchers yet. Mint one — it&apos;ll show up here.</p>
          ) : (
            vouchers.map((v) => {
              const st = statuses[v.id] || "…";
              return (
                <div className="voucher-row" key={v.id}>
                  <div>
                    <div className="amt">
                      {fmt.format(v.amountSats)} <small>sats</small>
                    </div>
                    <div className="note" style={{ fontStyle: "normal" }}>{v.title}</div>
                  </div>
                  <div className="row-actions">
                    <span className={`pill ${String(st).toLowerCase()}`}>{st}</span>
                    {st === "DELETED" ? (
                      <button className="btn-ghost" onClick={() => forget(v)}>Forget</button>
                    ) : (
                      <>
                        <Link href={`/v/${v.id}`}><button className="btn-brass">Open</button></Link>
                        <Link href={`/v/${v.id}?manage=${v.manageToken}`}><button className="btn-ghost">Manage</button></Link>
                        <button className="btn-danger" onClick={() => remove(v)}>Void</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
