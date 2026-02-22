# Database (Postgres + Prisma) — today-money-web

This app uses Postgres as the source of truth. Prisma is required.

## Connection (given)
A Postgres container already exists:

- Host: `db_todaymoney`
- User: `today`
- Password: `money`
- DB: `todaymoney`

Default connection string:
```
postgresql://today:money@db_todaymoney:5432/todaymoney?schema=public
```

## Global constraints
- Currency is **USD only** (store as `"USD"` anyway for future-proofing).
- Amounts stored in **integer cents** (`BIGINT`).
- Never store secrets in plaintext:
  - store refresh tokens as hashes
  - store Plaid access tokens encrypted at rest

---

## Prisma Models (required)

> Names can vary; relationships + constraints must match.

### User
- `id: String @id @default(uuid())`
- `email: String @unique`
- `passwordHash: String`
- `timezone: String @default("America/Los_Angeles")`
- timestamps

### RefreshSession
- `id: String @id @default(uuid())`
- `userId: String`
- `refreshTokenHash: String @unique`
- `expiresAt: DateTime`
- `revokedAt: DateTime?`
- timestamps
- index: `(userId)`

### BudgetProfile (one row per user)
- `userId: String @id`
- `currency: String @default("USD")`
- `incomeMonthlyCents: BigInt`
- `fixedMonthlyCents: BigInt`
- `sourceIncome: AmountSource` enum
- `sourceFixed: AmountSource` enum
- timestamps

### PlaidItem
- `id: String @id @default(uuid())`
- `userId: String`
- `plaidItemId: String @unique`
- `accessTokenEnc: String` (encrypted payload)
- `institutionId: String?`
- `institutionName: String?`
- `transactionsCursor: String?`
- `status: PlaidItemStatus @default(ACTIVE)` enum: `ACTIVE | DISCONNECTED`
- timestamps
- index: `(userId, status)`

### PlaidAccount (optional for MVP, but recommended)
- `id: String @id @default(uuid())`
- `itemId: String`
- `plaidAccountId: String @unique`
- `name: String`
- `mask: String?`
- `type: String?`
- `subtype: String?`
- timestamps

### PlaidRecurringStream
Store the latest recurring stream snapshot to compute suggestions quickly.

- `id: String @id @default(uuid())`
- `userId: String`
- `itemId: String`
- `plaidStreamId: String @unique`
- `direction: StreamDirection` enum: `INFLOW | OUTFLOW`
- `description: String`
- `merchantName: String?`
- `frequency: StreamFrequency` enum
- `avgAmountCents: BigInt`
- `lastAmountCents: BigInt`
- `predictedNextDate: DateTime?`
- `isActive: Boolean`
- `countsTowardIncome: Boolean`
- `countsTowardFixed: Boolean`
- `userAmountOverrideCents: BigInt?`
- timestamps
- index: `(userId, direction, isActive)`

### Transaction
A unified table for Plaid + Manual transactions.

Required fields:
- `id: String @id @default(uuid())`
- `userId: String`

Source:
- `source: TransactionSource` enum: `PLAID | MANUAL`

Plaid linkage (nullable if manual):
- `itemId: String?`
- `accountId: String?`
- `plaidTransactionId: String?` (unique if present)

Dates:
- `date: DateTime` (posted date)
- `authorizedDate: DateTime?`
- `effectiveDate: DateTime` (authorizedDate ?? date) persisted for indexing

Money:
- `amountCents: BigInt` (signed)
- `currency: String @default("USD")`

State:
- `pending: Boolean`
- `pendingTransactionId: String?`
- `isSuperseded: Boolean @default(false)` (pending replaced by posted)
- `isRemovedByPlaid: Boolean @default(false)` (Plaid “removed” list)

Classification:
- `budgetImpact: BudgetImpact`
- `userOverrideImpact: Boolean @default(false)` (true if user changed budgetImpact/hide)

User hide/delete:
- `isHidden: Boolean @default(false)` (hidden from UI)
- `hiddenReason: HiddenReason?` enum: `USER | SUPERSEDED | PLAID_REMOVED`

Metadata:
- `name: String`
- `merchantName: String?`
- `categoryPrimary: String?`
- `categoryDetailed: String?`
- `userNote: String?`
- timestamps

Indices:
- `(userId, effectiveDate)`
- `(userId, isHidden)`
- `(userId, budgetImpact, effectiveDate)`
- `(plaidTransactionId)` unique where not null

---

## Why we keep removed + hidden rows
To satisfy “users can remove Plaid transactions and they remain removed after sync”, we must never hard-delete Plaid transactions. Instead:
- on Plaid “removed”, set `isRemovedByPlaid=true`, optionally `hiddenReason=PLAID_REMOVED`
- on user hide/remove, set `isHidden=true`, `budgetImpact=USER_EXCLUDED`, `userOverrideImpact=true`

Sync upserts must **preserve**:
- `isHidden`
- `userOverrideImpact`
- `budgetImpact` (when userOverrideImpact=true)
