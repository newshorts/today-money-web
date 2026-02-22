# Codex Tasklist — today-money-web

This is an execution checklist Codex should follow in order.

## 0) Scaffold
- [ ] Create a Next.js project (TypeScript, App Router).
- [ ] Add ESLint + Prettier.
- [ ] Create folder layout described in `MASTER_OVERVIEW.md`.

## 1) Docker + Environment
- [ ] Add `Dockerfile.dev` for Next.js app (Node.js **24**) that runs the dev server on port **3000**.
- [ ] Do **not** add docker-compose. Postgres is an existing container named `db_todaymoney` on the same docker network.
- [ ] Add `.env.example` with:

```
# DB (provided container)
DATABASE_URL=postgresql://today:money@db_todaymoney:5432/todaymoney?schema=public

# Auth
JWT_ACCESS_SECRET=change-me
REFRESH_TOKEN_PEPPER=change-me

# Plaid
PLAID_ENV=sandbox
PLAID_CLIENT_ID=change-me
PLAID_SECRET=change-me
PLAID_WEBHOOK_URL=https://today.money/api/v1/plaid/webhook
PLAID_REDIRECT_URI=https://today.money/plaid

# Crypto (32-byte base64 key)
PLAID_TOKEN_ENCRYPTION_KEY=change-me-base64
PLAID_TOKEN_ENCRYPTION_KID=dev-1
```

- [ ] In code, default timezone constant:
  - `DEFAULT_TIMEZONE = "America/Los_Angeles"`

## 2) Prisma schema + migrations
- [ ] Implement Prisma schema per `docs/03-database.md`.
- [ ] Generate migrations.
- [ ] Add `prisma` scripts: `migrate`, `studio`, `generate`.

## 3) Core libs
Implement `/src/lib/*`:

- [ ] `db.ts` Prisma client singleton.
- [ ] `errors.ts` standard error format (see API contract).
- [ ] `money.ts` helpers (cents validation).
- [ ] `crypto.ts`:
  - AES-256-GCM encryption/decryption using `PLAID_TOKEN_ENCRYPTION_KEY`
  - envelope includes `kid`, `iv`, `tag`, `ciphertext`
- [ ] `auth.ts`:
  - password hashing (argon2id)
  - JWT sign/verify (15m TTL)
  - refresh token generate + hash (sha256(refresh + pepper))
  - refresh token rotation + revoke

## 4) API middleware patterns
- [ ] Build an `requireAuth(req)` helper:
  - parse Bearer token
  - verify JWT
  - attach `userId`
- [ ] Build a `json(req)` helper for parsing body safely.

## 5) Auth endpoints
Implement:
- [ ] `POST /api/v1/auth/register`
  - create user with timezone default `America/Los_Angeles`
  - create BudgetProfile with zeros OR sensible defaults (0/0 with USER_OVERRIDDEN)
  - return access + refresh tokens
- [ ] `POST /api/v1/auth/login`
- [ ] `POST /api/v1/auth/refresh` (rotate refresh token)
- [ ] `POST /api/v1/auth/logout` (revoke session)
- [ ] `GET /api/v1/me`
- [ ] `PATCH /api/v1/me` (timezone update)

## 6) Plaid client wrapper
- [ ] `plaid.ts` initializes Plaid client from env.
- [ ] `POST /api/v1/plaid/link-token`
  - create link token with:
    - products: transactions
    - webhook: PLAID_WEBHOOK_URL
    - redirect_uri: PLAID_REDIRECT_URI
    - transactions.days_requested = 365
- [ ] `POST /api/v1/plaid/exchange-public-token`
  - exchange token
  - encrypt + store access token
  - upsert PlaidItem
  - trigger sync (best effort) + recurring refresh

- [ ] `GET /api/v1/plaid/items`
- [ ] `DELETE /api/v1/plaid/items/{itemId}`
  - call Plaid item remove
  - mark DISCONNECTED

## 7) Sync engine
Implement `/src/lib/sync.ts` and endpoint `POST /api/v1/plaid/sync`:

- [ ] For each ACTIVE PlaidItem:
  - decrypt access token
  - call transactions sync with cursor
  - while has_more: continue
  - upsert adds/modifies
  - mark removes as `isRemovedByPlaid=true` (do not delete)

Merge rules for upsert:
- [ ] If existing row has `userOverrideImpact=true`, preserve:
  - `budgetImpact`
  - `isHidden`
- [ ] Preserve manual user metadata (userNote).
- [ ] Pending->posted dedupe:
  - if tx has `pending_transaction_id`, find pending tx and mark `isSuperseded=true` and hide it.

Classification on ingest (when not user-overridden):
- [ ] Transfer detection => `TRANSFER_EXCLUDED`
- [ ] amountCents < 0 => `INCOME_EXCLUDED`
- [ ] else => `VARIABLE`

## 8) Recurring streams + suggestions
Implement `/src/lib/recurring.ts` + endpoint `GET /api/v1/budget/suggestions`:

- [ ] Fetch recurring streams for each ACTIVE item.
- [ ] Persist into `PlaidRecurringStream`.
- [ ] Compute `suggestedIncomeMonthlyCents` and `suggestedFixedMonthlyCents`.

Also implement:
- [ ] Optional: apply stream tx id mapping:
  - outflow transaction_ids => mark `FIXED_EXCLUDED` unless userOverrideImpact=true
  - inflow transaction_ids => mark `INCOME_EXCLUDED` unless userOverrideImpact=true

## 9) Budget engine
Implement `/src/lib/budget.ts` + endpoints:

- [ ] `GET /api/v1/budget/profile`
- [ ] `PUT /api/v1/budget/profile`
- [ ] `GET /api/v1/budget/summary`

Summary must follow `docs/05-budget-engine.md`.

## 10) Transactions endpoints
- [ ] `GET /api/v1/transactions/month?year&month&includeHidden`
- [ ] `POST /api/v1/transactions/manual`
- [ ] `PATCH /api/v1/transactions/{id}`
- [ ] `DELETE /api/v1/transactions/{id}`

All must comply with `docs/02-api-contract.md`.

## 11) Webhooks (optional but recommended)
- [ ] `POST /api/v1/plaid/webhook`
- [ ] Optional verification support behind env flag:
  - verify Plaid-Verification JWT using JWK fetched from Plaid
  - cache JWK by kid
- [ ] On SYNC_UPDATES_AVAILABLE:
  - either trigger sync for that item immediately, or mark DB flag

## 12) Marketing site + OAuth landing + AASA
- [ ] Create marketing pages:
  - `/`, `/privacy`, `/terms`, `/support`
- [ ] Create `/plaid` landing page (basic UI and fallback)
- [ ] Create AASA route `/.well-known/apple-app-site-association`
  - return JSON, `Content-Type: application/json`
  - include appID: `ABCDE12345.com.todaymoney.app`
  - include paths: ["/plaid/*", "/plaid"]

## 13) Tests
- [ ] Unit tests for budget math:
  - remainder distribution
  - tomorrow preview
  - negative discretionary
- [ ] Unit tests for classification:
  - transfers excluded
  - refunds default excluded
  - pending included
- [ ] Integration smoke test for auth endpoints
