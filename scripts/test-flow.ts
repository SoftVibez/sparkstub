/**
 * End-to-end LNURL-withdraw flow test. Requires the dev server running with
 * DEV_FAKE_PAYMENTS=true:  npm run dev   (in another terminal), then  npm run test:flow
 *
 * Proves: happy-path withdraw, one-time-use rejection on second claim,
 * concurrent double-spend rejection, and invalid-link rejection.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3200";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function createVoucher(amountSats: number, title = "test") {
  const res = await fetch(`${BASE}/api/vouchers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountSats, title }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function simulate(id: string) {
  const res = await fetch(`${BASE}/api/lnurlw/${id}/simulate`, { method: "POST" });
  return res.json();
}

async function getVoucher(id: string, manageToken?: string) {
  const q = manageToken ? `?manage=${manageToken}` : "";
  return (await fetch(`${BASE}/api/vouchers/${id}${q}`, { cache: "no-store" })).json();
}

async function main() {
  console.log(`\nSparkstub flow test → ${BASE}\n`);

  // 1) Reachability + fake mode.
  const cfg = await fetch(`${BASE}/api/config`).then((r) => r.json());
  check("server reachable & DEV_FAKE_PAYMENTS on", cfg.fakePayments === true,
    "(set DEV_FAKE_PAYMENTS=true and restart dev server)");
  if (!cfg.fakePayments) {
    console.log("\nAborting: simulation needs fake-payments mode.\n");
    process.exit(1);
  }

  // 2) Happy path.
  console.log("\nHappy path:");
  const v = await createVoucher(2100, "happy");
  const r1 = await simulate(v.id);
  check("first claim returns OK", r1.status === "OK", JSON.stringify(r1));
  const after1 = await getVoucher(v.id, v.manageToken);
  check("voucher now REDEEMED", after1.status === "REDEEMED");
  check("paid attempt logged", after1.attempts.some((a: any) => a.outcome === "PAID"));

  // 3) One-time-use: second claim must be rejected.
  console.log("\nOne-time-use:");
  const r2 = await simulate(v.id);
  check("second claim rejected", r2.status === "ERROR", JSON.stringify(r2));
  check("reason mentions already claimed",
    /already/i.test(r2.reason || ""), r2.reason);
  const after2 = await getVoucher(v.id, v.manageToken);
  check("still REDEEMED (not double-paid)", after2.status === "REDEEMED");
  check("two attempts logged (1 paid, 1 rejected)",
    after2.attempts.filter((a: any) => a.outcome === "PAID").length === 1 &&
    after2.attempts.filter((a: any) => a.outcome === "REJECTED_ALREADY").length === 1);

  // 4) Concurrent double-spend: fire many claims at once, exactly one wins.
  console.log("\nConcurrent double-spend (race):");
  const vr = await createVoucher(5000, "race");
  const results = await Promise.all(Array.from({ length: 8 }, () => simulate(vr.id)));
  const oks = results.filter((r) => r.status === "OK").length;
  check("exactly one concurrent claim succeeds", oks === 1, `got ${oks} OK`);

  // 5) Invalid link.
  console.log("\nInvalid link:");
  const bad = await fetch(
    `${BASE}/api/lnurlw/callback?k1=deadbeef&pr=lnbc_x`
  ).then((r) => r.json());
  check("unknown k1 rejected", bad.status === "ERROR", JSON.stringify(bad));

  // 6) Access control: the public view must not leak owner-only data.
  console.log("\nAccess control:");
  const pub = await getVoucher(v.id); // no manage token
  check("public view hides claim attempts", pub.attempts === undefined);
  check("public view hides manage token", pub.manageToken === undefined);
  check("public view marks isOwner false", pub.isOwner === false);
  const owner = await getVoucher(v.id, v.manageToken);
  check("owner view exposes attempts", Array.isArray(owner.attempts));

  console.log(`\n${passed} passed, ${failed} failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nTest run errored:", e.message);
  process.exit(1);
});
