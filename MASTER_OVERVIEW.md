# Master Overview — today-money-web

This repository contains **both**:

1. **Marketing website** (Next.js App Router pages)
2. **Backend API** (Next.js Route Handlers under `/app/api/v1/*`)

It is the **source of truth** for:
- Postgres schema (Prisma)
- Plaid integration (tokens, sync, recurring, webhooks)
- Budget engine computation
- Canonical iOS ↔ backend API contract

---

## Codex rules

- Never run docker, docker compose, cloudflared, or edit any *-platform* / root infra files.
- Assume Postgres already exists at db_todaymoney:5432 on todaymoney_net.
- If DB isn’t reachable, report the failure and stop; don’t attempt to “fix infra”.
- Only run app-local commands: npm test, npm run dev, migrations, lint.
- The Dockerfile.dev is very fragile. Do not modify. If a change is needed, stop and ask the user to implement manually.

---

## Production Domain + Required Routes

- Primary domain: `today.money`
- Plaid OAuth redirect landing: `https://today.money/plaid`
- Plaid webhook receiver: `https://today.money/api/v1/plaid/webhook`
- Apple App Site Association (Universal Links):
  - `https://today.money/.well-known/apple-app-site-association`

### Universal Links identifiers (hardcoded for now)
- Apple Team ID: `ABCDE12345`
- iOS Bundle ID: `com.todaymoney.app`
- AASA `appID`: `ABCDE12345.com.todaymoney.app`

---

## Postgres Connectivity (given)

A Postgres container is already running with:

- Hostname: `db_todaymoney`
- Username: `today`
- Password: `money`
- Database: `todaymoney`

Default `DATABASE_URL` to use:

```
postgresql://today:money@db_todaymoney:5432/todaymoney?schema=public
```

The web container must share a docker network with `db_todaymoney` so that hostname resolves. The network name is `todaymoney_net`

---

## Docker (single container)

This repo does **not** include docker-compose.

Codex should add a development Dockerfile:
- `Dockerfile.dev`
- Node.js **24**
- Exposes port **3000**
- Runs `next dev` bound to `0.0.0.0`

Postgres is assumed to be running in a separate container named `db_todaymoney` on the same docker network.

---

## Timezone Behavior (locked)

- Server default timezone: **America/Los_Angeles**
- On user registration, `timezone` is set to `America/Los_Angeles` unless the user later updates it via `PATCH /api/v1/me`.

All date-based computations (month boundaries, “today”, daily accrual) use the user timezone stored in DB.

---

## What the System Does

### Core experience
- Users see **Remaining Today** and **Tomorrow Preview**.
- App supports **manual-only** budgeting or **Plaid-connected** budgeting.
- Fixed monthly expenses are **one number**, not a list.
- Plaid is used for:
  - suggesting monthly recurring income and fixed expenses
  - syncing daily transactions
- Users can **exclude/hide** Plaid transactions permanently (survives future syncs).

### Budget math (calendar month)
Docs: `docs/05-budget-engine.md`

- `discretionary = incomeMonthly - fixedMonthly`
- distribute across days in calendar month in **cents-exact** manner (no drift)
- pending transactions count as spent
- transfers always excluded
- refunds (negative amounts) default to excluded; user can override to count

---

## Directory Plan (Codex should create)

```
/app
  /(marketing)
    page.tsx
    privacy/page.tsx
    terms/page.tsx
    support/page.tsx
    plaid/page.tsx
  /.well-known/apple-app-site-association/route.ts
  /api/v1
    /health/route.ts
    /me/route.ts
    /auth/register/route.ts
    /auth/login/route.ts
    /auth/refresh/route.ts
    /auth/logout/route.ts
    /plaid/link-token/route.ts
    /plaid/exchange-public-token/route.ts
    /plaid/items/route.ts
    /plaid/items/[itemId]/route.ts
    /plaid/sync/route.ts
    /plaid/webhook/route.ts
    /budget/profile/route.ts
    /budget/suggestions/route.ts
    /budget/summary/route.ts
    /transactions/month/route.ts
    /transactions/manual/route.ts
    /transactions/[id]/route.ts
/prisma
  schema.prisma
/src
  /lib
    auth.ts
    crypto.ts
    db.ts
    errors.ts
    money.ts
    plaid.ts
    sync.ts
    recurring.ts
    classification.ts
    budget.ts
  /contracts
    schemas.ts (zod)
```

---

## Implementation Priorities (MVP order)

1. **Prisma schema + migrations** (connect to db_todaymoney)
2. **Auth** (email/password + JWT access token + rotating refresh token)
3. **Plaid Link** endpoints (link token + exchange public token) — multi-item support
4. **Transactions sync** via `/transactions/sync` with cursor per item
5. **User overrides** persist and override sync updates (hide/exclude)
6. **Recurring streams** fetch + suggestions for income/fixed
7. **Budget endpoints** (profile + summary)
8. **Webhook receiver** (verification optional in MVP; include code path)
9. Marketing pages + `/plaid` redirect landing + AASA route

---

## Codex Operating Instructions

Codex should implement this repo by following (in order):

- `docs/06-codex-tasklist.md`
- `docs/02-api-contract.md` (canonical JSON contracts)
- `docs/03-database.md` (Prisma schema requirements)
- `docs/04-plaid.md` (Plaid integration specifics)
- `docs/05-budget-engine.md` (math + classification rules)

Codex must treat the API contract as authoritative and keep it stable unless explicitly updated.

---

## Open Questions (must be filled before final OAuth-ready release)

1. Final deployment environment (Vercel vs container hosting) to confirm webhook reliability + long sync durations.
