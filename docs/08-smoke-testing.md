# Smoke Testing Runbook

This runbook validates the today.money API and Plaid sandbox hookup from inside the `todaymoney` repo.

## Boundaries

- Only run commands from `/Users/mike/Development/hosting/todaymoney`.
- Do not modify Docker/cloudflared/Caddy/compose from this runbook.
- Do not modify `Dockerfile.dev` as part of smoke testing.

## Prerequisites

- App is running and reachable.
- Database migration is applied.
- `.env` contains valid auth, DB, and Plaid sandbox credentials.
- Base URL is reachable from the runtime where tests are executed.

## Environment Variables

Required for all smoke scripts:

- `API_BASE_URL` (example: `https://today.money`)

Optional user identity controls:

- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`

Plaid live controls:

- `RUN_LIVE_PLAID_TESTS=true` to run plaid + webhook scripts
- `PLAID_SANDBOX_INSTITUTION_ID` (default `ins_109508`)
- `SMOKE_PLAID_DISCONNECT=true` to disconnect linked items during cleanup

Webhook verification controls:

- `PLAID_WEBHOOK_VERIFICATION_EXPECTED=true` when backend verification is enabled
- `RUN_SIGNED_WEBHOOK_TESTS=true` to fire signed sandbox webhooks

## Command Set

Baseline checks:

```bash
npm run lint
npm run typecheck
npm test
```

API-only smoke:

```bash
API_BASE_URL=https://today.money npm run smoke:api
```

Plaid sandbox smoke:

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:plaid
```

Webhook smoke (verification off stage):

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:webhook
```

Webhook smoke (verification on stage):

```bash
API_BASE_URL=https://today.money \
RUN_LIVE_PLAID_TESTS=true \
PLAID_WEBHOOK_VERIFICATION_EXPECTED=true \
RUN_SIGNED_WEBHOOK_TESTS=true \
npm run smoke:webhook
```

Full suite:

```bash
API_BASE_URL=https://today.money RUN_LIVE_PLAID_TESTS=true npm run smoke:all
```

## What Each Script Covers

- `smoke:api`
- `/api/v1/health`
- auth register/login/refresh/logout
- profile get/patch
- budget profile get/put + budget summary
- manual transactions create/list/patch/delete

- `smoke:plaid`
- `/api/v1/plaid/link-token`
- sandbox public token creation
- `/api/v1/plaid/exchange-public-token`
- `/api/v1/plaid/items`
- `/api/v1/plaid/sync` (with retry)
- `/api/v1/budget/suggestions`
- `/api/v1/budget/summary`

- `smoke:webhook`
- unsigned direct webhook POST for sync/recurring webhook codes
- optional signed webhook fire from Plaid sandbox
- optional item disconnect cleanup

## Failure Triage

- `Could not resolve host` / connection refused:
- test runner environment cannot reach `API_BASE_URL`.

- `401` on unsigned webhook when verification expected is false:
- backend likely has `PLAID_WEBHOOK_VERIFICATION=true`.

- `500` during `/plaid/sync` shortly after exchange:
- Plaid transactions data may not be ready yet; script retries automatically.

- signed webhook stage fails while unsigned passes:
- check Plaid credentials, sandbox mode, and verification configuration.
