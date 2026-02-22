# Architecture — today-money-web

## Responsibilities
This repo provides:
- Marketing site pages (public)
- Backend API (private, authenticated)
- Plaid integration (server-side only)
- Budget engine + aggregation
- Postgres persistence layer

## Components
- **Next.js App Router**
  - Marketing: `/`, `/privacy`, `/terms`, `/support`
  - OAuth landing: `/plaid`
  - API routes under `/api/v1/*`
  - AASA route: `/.well-known/apple-app-site-association`

- **Postgres**
  - Running in existing container `db_todaymoney`

- **Plaid**
  - Link token creation
  - public token exchange
  - transactions sync
  - recurring streams
  - webhooks

## Trust boundaries (non-negotiable)
- Plaid `access_token` is **never returned to clients**.
- Backend stores Plaid tokens **encrypted at rest**.
- Clients authenticate with backend using:
  - short-lived access JWT
  - rotating refresh token

## High-level flows

### Auth
1. Client registers / logs in.
2. Backend issues `accessToken` (JWT) + `refreshToken` (opaque).
3. Client uses `Authorization: Bearer <accessToken>` for API calls.
4. Client refreshes via `POST /auth/refresh` on 401.

### Plaid Link (multi-item)
1. Client calls `POST /plaid/link-token`
2. Backend calls Plaid Link token create, returns `link_token`
3. Client opens Plaid Link
4. Client receives `public_token`
5. Client sends `public_token` to `POST /plaid/exchange-public-token`
6. Backend exchanges token, stores `access_token` + `item_id`
7. Backend triggers initial sync + recurring refresh

### Transactions
- Backend runs `/transactions/sync` for each active item using per-item cursor.
- Upsert transactions into DB with stable user overrides.

### Budget summary
- Budget engine runs on request:
  - reads BudgetProfile (income/fixed)
  - aggregates variable spend MTD (pending included)
  - returns today remaining + tomorrow preview

### Webhooks (optional but recommended)
- Plaid webhook hits `POST /plaid/webhook`
- Backend validates webhook signature (when configured)
- Backend triggers or schedules item sync

## Time + timezone
- Default timezone is `America/Los_Angeles`.
- All month calculations are based on the user timezone stored in DB.
- If user changes timezone, month boundaries and “today” shift accordingly.
