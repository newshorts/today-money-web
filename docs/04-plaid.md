# Plaid Integration — today-money-web

## Goals
- Allow users to connect **multiple** institutions (multiple Items).
- Suggest:
  - monthly recurring **income** total
  - monthly recurring **fixed** expense total (single number)
- Sync daily transactions and support:
  - pending counts as spent
  - transfers excluded
  - user hide/exclude persists across sync

## Environment Variables (required)
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` = `sandbox | development | production`
- `PLAID_WEBHOOK_URL` = `https://today.money/api/v1/plaid/webhook` (prod)
- `PLAID_REDIRECT_URI` = `https://today.money/plaid` (prod)
- `PLAID_PRODUCTS` = `transactions` (MVP)

## Link Token Creation
Endpoint: `POST /api/v1/plaid/link-token`

Plaid request must include:
- `products: ["transactions"]`
- `country_codes: ["US"]`
- `language: "en"`
- `redirect_uri: PLAID_REDIRECT_URI` (required for OAuth institutions)
- `webhook: PLAID_WEBHOOK_URL`
- `transactions: { days_requested: 365 }`
  - Rationale: recurring detection quality improves with larger history; request >= 180 days; choose 365 for better suggestions.

Also include:
- `user.client_user_id = <userId>`

Return `link_token` to client.

## Public Token Exchange
Endpoint: `POST /api/v1/plaid/exchange-public-token`

- Exchange `public_token` for `access_token` and `item_id`.
- Encrypt `access_token` before storing.
- Store `plaid_item_id`, institution metadata from Link callback.

After exchange:
- Trigger an initial `transactions_sync` for the new item.
- Trigger `recurring_refresh` for the new item (best effort; can be deferred).

## Transactions Sync (per item)
Endpoint: `POST /api/v1/plaid/sync`

Implementation details:
- For each active item:
  - decrypt `access_token`
  - call Plaid transactions sync using the stored cursor
  - loop pages until `has_more=false`
  - persist the new cursor

DB merge rules:
- Upsert by `plaidTransactionId`
- If userOverrideImpact=true, preserve `budgetImpact` and `isHidden` even if Plaid classification changes
- If Plaid includes a transaction in `removed`, set `isRemovedByPlaid=true` and hide by default unless user has explicitly un-hidden it (rare)
- Handle pending->posted dedupe:
  - if posted tx has `pending_transaction_id`, mark the pending row `isSuperseded=true` and hide it

Default classification (on ingest):
- If transfer-like => `TRANSFER_EXCLUDED` (always)
- Else if amountCents < 0 => `INCOME_EXCLUDED` (refunds default excluded; user can override to VARIABLE)
- Else => `VARIABLE`

## Transfer detection
Transfers must always be excluded. Prefer:
- personal_finance_category.primary in (TRANSFER_IN, TRANSFER_OUT)
- transaction_code == "transfer"
- fallback heuristics only if both missing

## Recurring Streams (suggestions)
Endpoint: `GET /api/v1/budget/suggestions` (server computes totals)

Process:
- Call Plaid recurring endpoint for each item.
- Persist recurring streams in `PlaidRecurringStream`.
- Compute suggested totals:
  - incomeMonthly = sum(monthlyEquivalent(stream)) for inflow streams where countsTowardIncome=true and isActive=true
  - fixedMonthly = sum(monthlyEquivalent(stream)) for outflow streams where countsTowardFixed=true and isActive=true

Monthly equivalent conversion:
- MONTHLY: x
- SEMI_MONTHLY: x * 2
- BIWEEKLY: x * (26/12)
- WEEKLY: x * (52/12)
- ANNUALLY: x / 12
Round to cents (integer).

Mapping recurring transaction IDs:
- For recurring OUTFLOW streams, mark matching transactions as `FIXED_EXCLUDED` unless userOverrideImpact=true.
- For recurring INFLOW streams, mark matching transactions as `INCOME_EXCLUDED` unless userOverrideImpact=true.

## Webhooks (optional but recommended)
Endpoint: `POST /api/v1/plaid/webhook`

Events to handle:
- `SYNC_UPDATES_AVAILABLE` => mark item “needs_sync” or trigger sync
- `RECURRING_TRANSACTIONS_UPDATE` => refresh recurring streams

Verification:
- If enabled, verify `Plaid-Verification` JWT header against Plaid JWK fetched from `/webhook_verification_key/get`.
- Cache JWK by `kid` for performance.

## OAuth Redirect Landing + Universal Links
This repo must serve:
- `GET /plaid` — lightweight HTML page (fallback for browsers) that can:
  - show “Return to the app”
  - optionally attempt `window.close()` if launched from SFSafariViewController

For iOS Universal Links:
- Serve AASA JSON at `/.well-known/apple-app-site-association`.
- The AASA `paths` must include `/plaid/*` (or `/plaid`) to route OAuth returns to the app.

The AASA in this plan is hardcoded for now:
- Apple Team ID: `ABCDE12345`
- iOS Bundle ID: `com.todaymoney.app`
- `appID`: `ABCDE12345.com.todaymoney.app`

Recommended AASA response payload:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "ABCDE12345.com.todaymoney.app",
        "paths": ["/plaid", "/plaid/*"]
      }
    ]
  }
}
```
