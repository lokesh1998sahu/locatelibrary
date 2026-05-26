# CLAUDE.md

Context loaded automatically into every Claude session for this repo. Keep it short — details belong in the code or in `/memory`.

## About the user (Lokesh)

- Non-developer actively learning to code — explain things in plain English and avoid jargon when possible.
- Works on **Windows 11** with **PowerShell** as the default shell. Bash is available via WSL/Git Bash if needed.
- Sometimes drives Claude **from his phone via Remote Control** — keep replies concise and easy to act on.
- **Always confirm before big or destructive changes** (multi-file edits, renames, deletes, git history rewrites, config changes, deploys). Small reversible edits are fine to make and report.

## Project: locatelibrary.com

A Next.js site that hosts several small sub-apps under one App Router project. Deployed on **Vercel**, version-controlled with **Git**.

### Tech stack
- **Next.js 16.1.6** (App Router) + **React 19.2.3** + **TypeScript 5**
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **ESLint 9** with `eslint-config-next`
- **Google Apps Script** as the backend for every dynamic feature (data lives in Google Sheets)

### Scripts (`package.json`)
```
npm run dev     # next dev — local development server
npm run build   # next build — production build
npm run start   # next start — run production build locally
npm run lint    # eslint
```

### Folder layout

```
app/                      Next.js App Router
  layout.tsx              Root layout (Geist fonts, global manifest)
  page.tsx                Marketing landing — renders components/hero.tsx
  globals.css             Tailwind + LMA theme tokens
  api/
    subscribe/route.ts    Newsletter signup → Apps Script (URL hard-coded)
    ledger/route.ts       Finance proxy → Apps Script (APPS_SCRIPT_URL)
    admissions/route.ts   Admissions proxy → Apps Script
    lma/route.ts          LMA proxy → Apps Script (with 30s timeout)
  whatsapp/page.tsx       WhatsApp redirect PWA (own scope /whatsapp)
  lma/                    Library Management App — PWA scoped to /lma
    layout.tsx            LMA shell + PwaRegister
    page.tsx              Password gate + home launcher
    sw.js, manifest.webmanifest, icons/
    _components/          LMA-local React components
    admissions/ board/ renewals/ students/ dues/
    misc-income/ refunds/ receipts/ dashboard/ settings/
  mf-2/                   "My Financials 2.0" — private finance app
    (dashboard, add, ledger, masters)
  admissions/ kl-0508/ libraries-9608/ owner/
  cleaner/{daily,weekly}/ tech-tool/
components/               Shared React components (hero, TechToolNav, etc.)
public/                   Static assets, PWA icons, /whatsapp PWA assets
next.config.ts            Host redirect: finance.locatelibrary.com → /mf-2
tsconfig.json             Strict TS, "@/*" path alias for repo root
eslint.config.mjs         Flat config, extends next/core-web-vitals + next/typescript
vecel.json                ⚠ typo of `vercel.json` — see "Known cruft" below
```

### Sub-apps at a glance

| Route       | What it is                                         | Auth                          | PWA |
|-------------|----------------------------------------------------|-------------------------------|-----|
| `/`         | Marketing landing                                  | public                        | no  |
| `/whatsapp` | Paste a number, jump to WhatsApp chat              | public                        | yes |
| `/lma`      | Library Management App (most active area)          | `NEXT_PUBLIC_LMA_PASSWORD`    | yes |
| `/mf-2`     | Personal finance dashboard                         | `NEXT_PUBLIC_FINANCE_PASSWORD`| no  |
| `/owner`, `/admissions`, `/kl-0508`, `/libraries-9608`, `/cleaner/*`, `/tech-tool` | Various utilities | env-var passwords | no |

### Backend pattern

Every dynamic page calls a Next.js API route under `app/api/*`. Each route is a thin proxy that `fetch()`es a **Google Apps Script** web app URL with a timeout, parses the JSON, and returns it. Apps Script reads/writes Google Sheets.

When editing a sub-app's data flow, the chain is usually: **Page → `/api/<thing>` → Apps Script → Google Sheet**.

### Environment variables (`.env.local`, gitignored)

- `NEXT_PUBLIC_LMA_SCRIPT_URL`, `NEXT_PUBLIC_LMA_PASSWORD`
- `NEXT_PUBLIC_ADMISSIONS_SCRIPT_URL`, `NEXT_PUBLIC_ADMISSIONS_PASSWORD`
- `NEXT_PUBLIC_FINANCE_PASSWORD`, `NEXT_PUBLIC_SCRIPT_URL`, `APPS_SCRIPT_URL`
- `NEXT_PUBLIC_OWNER_PASSWORD`, `NEXT_PUBLIC_KL_PASSWORD`, `NEXT_PUBLIC_LIBRARIES_PASSWORD`

> ⚠ Any `NEXT_PUBLIC_*` value is **shipped to the browser bundle** and visible in DevTools — these passwords are soft gates, not real security.

## Known cruft worth flagging (do not auto-fix)

1. **`vecel.json` is misspelled** — should be `vercel.json`. The `maxDuration: 30` it sets for `/api/ledger` is currently NOT being applied in production.
2. **Stray 0-byte files at the repo root** — `(`, `{`, `git`, `b.library_code`, `r.json())`. Almost certainly accidental shell typos. Safe to remove after confirming they aren't tracked.
3. **`NEXT_PUBLIC_OWNER_PASSWORD` is duplicated** in `.env.local` (two lines, same key).
4. **`app/api/subscribe/route.ts` has a hard-coded Apps Script URL** — every other API route uses an env var. Worth moving for consistency.
5. **Passwords use `NEXT_PUBLIC_*` env vars** — visible in client bundles (see above).

Mention these in passing the next time related work happens; don't change them without asking.

## Conventions worth knowing

- **Path alias:** `@/*` → repo root (e.g. `import Hero from "@/components/hero"`).
- **Service workers** are scoped strictly to their sub-app (`/lma/sw.js` only handles `/lma/*`). Never broaden a scope.
- Each sub-app is roughly independent — don't refactor across them in the same change.
- This repo runs on **Windows + PowerShell**. Prefer PowerShell-compatible commands when suggesting shell snippets.
