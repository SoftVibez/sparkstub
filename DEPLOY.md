# Deploying Sparkstub to Vercel

Sparkstub is a normal Next.js app. The only special parts are: it needs a
**Postgres database** (Vercel's filesystem is temporary, so the old SQLite file
won't work) and a few **environment variables**.

---

## Step 1 — Put the code on GitHub

From inside the `sparkstub` folder:

```bash
git init
git add .
git commit -m "Sparkstub"
```

Create an empty repo on github.com (no README), then:

```bash
git remote add origin https://github.com/<you>/sparkstub.git
git branch -M main
git push -u origin main
```

> `.env` is git-ignored, so your secrets are NOT uploaded. Good.

---

## Step 2 — Import into Vercel

1. vercel.com → **Add New… → Project** → import your `sparkstub` repo.
2. Framework preset: **Next.js** (auto-detected). Don't deploy yet — add the
   database and env vars first (Steps 3–4), or the first build will fail.

---

## Step 3 — Add a free Postgres database

1. In your Vercel project → **Storage** tab → **Create Database** → **Neon**
   (Postgres) → accept the free plan.
2. Connect it to this project. Vercel auto-adds the DB env vars, including
   **`DATABASE_URL`** and **`DATABASE_URL_UNPOOLED`** — which is exactly what the
   app expects. You don't have to copy anything by hand.

---

## Step 4 — Set the app's environment variables

Project → **Settings → Environment Variables**. Add:

| Name | Value | Notes |
|------|-------|-------|
| `DEV_FAKE_PAYMENTS` | `false` | real payouts (use `true` for a no-wallet demo) |
| `NEXT_PUBLIC_BASE_URL` | `https://<your-project>.vercel.app` | your live URL; used in the QR + the LNbits webhook |
| `NEXT_PUBLIC_DEFAULT_LNBITS_URL` | `https://demo.lnbits.com` | optional: pre-fills the connect form |

`DATABASE_URL` and `DATABASE_URL_UNPOOLED` are already there from Step 3.

> You can't know the exact `*.vercel.app` URL until the project exists, but Vercel
> shows it on the project page (usually `https://<project-name>.vercel.app`). Set
> `NEXT_PUBLIC_BASE_URL` to that, then deploy/redeploy.

---

## Step 5 — Deploy

Click **Deploy**. The build runs `prisma db push` automatically, so your database
tables are created on the first deploy — nothing to run by hand.

When it's live, open the URL, connect a (funded) LNbits wallet with the
**Withdraw Links** extension enabled, and mint a voucher.

---

## Updating later

Every `git push` to `main` triggers a new Vercel deploy automatically.

## Notes
- The app stores **no spending keys** — only public voucher links — so the
  database holding them is low-risk by design.
- `demo.lnbits.com` is a shared, periodically-wiped demo; use a more reliable
  LNbits instance for anything real.
