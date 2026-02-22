# Deep Smoke Testing Runbook

This runbook validates the today.money API and Plaid sandbox integration from inside this repo.

## Scope + Guardrails

- Run from `/Users/mike/Development/hosting/todaymoney`.
- No infra edits (docker compose, cloudflared, Caddy) from this runbook.
- No Dockerfile modifications.

## Release Gate

Core gate command:

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:gate
```

`smoke:gate` blocks release if either API deep smoke or Plaid sandbox core smoke fails.

## Environment Variables

Required:

- `API_BASE_URL` (for single target)

Optional for domain matrix:

- `API_BASE_URLS` comma-separated list for `smoke:matrix`

Smoke user (dedicated/repeatable):

- `SMOKE_EMAIL` (default `smoke.shared@today.money`)
- `SMOKE_PASSWORD` (default `SmokePassword-2026!`)

Plaid controls:

- `RUN_LIVE_PLAID_TESTS=true` to execute Plaid + webhook scripts
- `PLAID_SANDBOX_INSTITUTION_ID` (default `ins_109508`)
- `SMOKE_PLAID_DISCONNECT=true` to disconnect linked item at end

Webhook controls:

- `PLAID_WEBHOOK_VERIFICATION_EXPECTED=true` when backend verification is enabled
- `RUN_SIGNED_WEBHOOK_TESTS=true` to fire signed sandbox webhooks
- `RUN_WEBHOOK_TESTS=true` for matrix runs

## Layered Coverage

### Layer 1: Contract happy-path smoke (`smoke:api`)

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login` (always tested explicitly)
- `GET/PATCH /api/v1/me`
- `GET/PUT /api/v1/budget/profile`
- `GET /api/v1/budget/suggestions`
- `GET /api/v1/budget/summary`
- `POST /api/v1/transactions/manual`
- `GET /api/v1/transactions/month`
- `PATCH/DELETE /api/v1/transactions/{id}`

### Layer 2: Auth lifecycle + security (`smoke:api`)

- duplicate register rejected
- invalid login rejected
- missing bearer rejected
- invalid bearer rejected
- refresh rotation success
- old refresh token reuse rejected
- post-logout refresh rejected

### Layer 3: Budget + transaction integrity (`smoke:api`)

- budget profile roundtrip
- summary invariants present
- hidden vs includeHidden month filtering
- `authorizedDate` nullability assertion for manual transactions

### Layer 4: Plaid sandbox core (`smoke:plaid`)

- `POST /api/v1/plaid/link-token`
- sandbox public token creation (server-driven)
- `POST /api/v1/plaid/exchange-public-token`
- `GET /api/v1/plaid/items`
- `POST /api/v1/plaid/sync` with retry
- `GET /api/v1/budget/suggestions`
- `GET /api/v1/budget/summary`
- optional disconnect flow

### Layer 5: Webhook validation (`smoke:webhook`)

Stage A:

- unsigned direct `POST /api/v1/plaid/webhook` for:
  - `SYNC_UPDATES_AVAILABLE`
  - `RECURRING_TRANSACTIONS_UPDATE`

Stage B (optional):

- signed sandbox webhooks via Plaid fire endpoint
- post-event health checks on plaid item listing

### Layer 6: Domain execution matrix (`smoke:matrix`)

- executes deep suite per base URL in `API_BASE_URLS`
- runs API always
- runs Plaid when `RUN_LIVE_PLAID_TESTS=true`
- runs webhooks when `RUN_WEBHOOK_TESTS=true`

## Commands

Baseline static checks:

```bash
npm run lint
npm run typecheck
npm test
```

API deep smoke only:

```bash
API_BASE_URL=https://today.money npm run smoke:api
```

Plaid core smoke:

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:plaid
```

Webhook smoke (verification off first):

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:webhook
```

Webhook smoke (verification on + signed stage):

```bash
API_BASE_URL=https://today.money \
RUN_LIVE_PLAID_TESTS=true \
PLAID_WEBHOOK_VERIFICATION_EXPECTED=true \
RUN_SIGNED_WEBHOOK_TESTS=true \
npm run smoke:webhook
```

Full gate:

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:gate
```

All layers (single domain):

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:all
```

Matrix mode:

```bash
API_BASE_URLS="https://today.money,https://your-other-host" \
RUN_LIVE_PLAID_TESTS=true \
RUN_WEBHOOK_TESTS=true \
npm run smoke:matrix
```

## Failure Triage

- `ENOTFOUND` / connection refused:
- the test runner cannot reach the provided base URL.

- `401` on unsigned webhook when verification is not expected:
- backend likely has `PLAID_WEBHOOK_VERIFICATION=true`.

- `500` after exchange during sync:
- Plaid data may still be settling; sync retry path should absorb this.

- signed webhook stage fails while unsigned passes:
- investigate Plaid credentials, webhook verification env, and tunnel delivery.
