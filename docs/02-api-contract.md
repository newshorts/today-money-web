# API Contract (Canonical) — today-money-web

Base path: `/api/v1`

Production base URL (planned): `https://today.money`

Auth: `Authorization: Bearer <accessToken>`

All money uses **integer cents** (USD only).

---

## Common Types

### Money (inline fields)
- `amountCents: number` (signed int, e.g. spend is positive, refund/income negative)
- `currency: "USD"`

### Error Response (non-2xx)
```json
{
  "error": {
    "code": "STRING_ENUM",
    "message": "Human readable",
    "details": { "optional": "object" }
  }
}
```

### Enums

#### BudgetImpact
- `VARIABLE` — counts against daily budget
- `FIXED_EXCLUDED` — excluded because accounted for in fixed monthly total
- `TRANSFER_EXCLUDED` — excluded always (transfers)
- `INCOME_EXCLUDED` — excluded always (income/refund/credit default)
- `USER_EXCLUDED` — user excluded (also used for “removed”)

#### TransactionSource
- `PLAID`
- `MANUAL`

#### AmountSource
- `PLAID_SUGGESTED`
- `USER_OVERRIDDEN`

---

## Auth

### POST /auth/register
Create a user. **Timezone defaults to America/Los_Angeles** server-side.

Request:
```json
{ "email": "user@example.com", "password": "..." }
```

Response:
```json
{
  "user": { "id": "uuid", "email": "user@example.com", "timezone": "America/Los_Angeles" },
  "accessToken": "jwt",
  "refreshToken": "opaque"
}
```

### POST /auth/login
Request:
```json
{ "email": "user@example.com", "password": "..." }
```

Response: same as register.

### POST /auth/refresh
Rotates refresh token.

Request:
```json
{ "refreshToken": "opaque" }
```

Response:
```json
{ "accessToken": "jwt", "refreshToken": "opaque" }
```

### POST /auth/logout
Request:
```json
{ "refreshToken": "opaque" }
```

Response: `204 No Content`

---

## User Profile

### GET /me
Response:
```json
{ "id": "uuid", "email": "user@example.com", "timezone": "America/Los_Angeles" }
```

### PATCH /me
Request:
```json
{ "timezone": "America/Denver" }
```

Response:
```json
{ "id": "uuid", "email": "user@example.com", "timezone": "America/Denver" }
```

---

## Plaid

### POST /plaid/link-token
Creates a link token for adding a new Plaid Item.

Response:
```json
{
  "linkToken": "link-...",
  "expiration": "2026-02-21T19:34:11Z"
}
```

### POST /plaid/exchange-public-token
Exchanges a public token for an access token and persists a new Item.

Request:
```json
{
  "publicToken": "public-...",
  "metadata": { "institutionId": "ins_123", "institutionName": "Chase" }
}
```

Response:
```json
{ "status": "OK" }
```

### GET /plaid/items
Response:
```json
{
  "items": [
    { "id": "uuid", "institutionName": "Chase", "status": "ACTIVE", "createdAt": "2026-02-21T19:34:11Z" }
  ]
}
```

### DELETE /plaid/items/{itemId}
Disconnects an item (server calls Plaid item remove, then marks item DISCONNECTED).

Response: `204 No Content`

### POST /plaid/sync
Triggers a sync for **all active items** for the authenticated user.

Response:
```json
{
  "status": "OK",
  "syncedItems": 2,
  "added": 10,
  "modified": 1,
  "removed": 0,
  "asOf": "2026-02-21T19:34:11Z"
}
```

### POST /plaid/webhook
Called by Plaid. No auth header. Verify signature if PLAID_WEBHOOK_VERIFICATION is enabled.

Response: `200 OK` with `{ "status": "OK" }`.

---

## Budget

### GET /budget/profile
Returns the user’s current monthly numbers.

Response:
```json
{
  "currency": "USD",
  "incomeMonthlyCents": 800000,
  "fixedMonthlyCents": 350000,
  "sourceIncome": "PLAID_SUGGESTED",
  "sourceFixed": "PLAID_SUGGESTED"
}
```

### PUT /budget/profile
Sets monthly numbers (manual or overrides Plaid suggestions).

Request:
```json
{
  "incomeMonthlyCents": 820000,
  "fixedMonthlyCents": 360000,
  "sourceIncome": "USER_OVERRIDDEN",
  "sourceFixed": "USER_OVERRIDDEN"
}
```

Response: same as GET.

### GET /budget/suggestions
Returns Plaid-derived suggestion totals (if any items exist). If no Plaid items, return zeros and `available=false`.

Response:
```json
{
  "available": true,
  "currency": "USD",
  "suggestedIncomeMonthlyCents": 800000,
  "suggestedFixedMonthlyCents": 350000
}
```

### GET /budget/summary
Computes today’s budget summary for the current calendar month (in user timezone).

Response:
```json
{
  "date": "2026-02-21",
  "timezone": "America/Los_Angeles",
  "currency": "USD",

  "incomeMonthlyCents": 800000,
  "fixedMonthlyCents": 350000,
  "discretionaryMonthlyCents": 450000,

  "daysInMonth": 28,
  "allowanceTodayCents": 16071,

  "availableStartOfDayCents": 22000,
  "spentTodayCents": 4500,
  "remainingTodayCents": 17500,

  "tomorrowPreviewCents": 33571
}
```

---

## Transactions

### GET /transactions/month?year=YYYY&month=MM&includeHidden=false
Returns all transactions (Plaid + manual) for a calendar month in user timezone.

Response:
```json
{
  "year": 2026,
  "month": 2,
  "currency": "USD",
  "transactions": [
    {
      "id": "uuid",
      "source": "PLAID",

      "date": "2026-02-21",
      "authorizedDate": "2026-02-21",
      "effectiveDate": "2026-02-21",

      "name": "King Soopers",
      "merchantName": "King Soopers",

      "amountCents": 5234,
      "currency": "USD",

      "pending": true,
      "budgetImpact": "VARIABLE",

      "isHidden": false,
      "userOverrideImpact": false
    }
  ]
}
```

### POST /transactions/manual
Creates a manual expense/income entry.

Request:
```json
{
  "effectiveDate": "2026-02-21",
  "name": "Cash lunch",
  "amountCents": 1200,
  "currency": "USD"
}
```

Response:
```json
{ "id": "uuid" }
```

### PATCH /transactions/{id}
Updates user override fields.

Request (examples):
```json
{ "budgetImpact": "USER_EXCLUDED", "userOverrideImpact": true }
```

```json
{ "isHidden": true, "budgetImpact": "USER_EXCLUDED", "userOverrideImpact": true }
```

```json
{ "userOverrideImpact": false, "isHidden": false }
```

Response:
```json
{ "status": "OK" }
```

### DELETE /transactions/{id}
- If `source == MANUAL`: soft delete (hide).
- If `source == PLAID`: equivalent to PATCH `isHidden=true` and `budgetImpact=USER_EXCLUDED`.

Response: `204 No Content`
