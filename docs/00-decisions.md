# Product Decisions (Locked) — today-money-web

## Budget period
- **Calendar month** only (based on user timezone).

## Currency
- **USD only** for MVP.

## Transactions
- **Pending transactions count as spent**.
- **Transfers are always excluded** from budget.
- **Refunds/credits** (negative amounts) default to **excluded** (treated as income/credit), but user may override to count them toward budget.

## Fixed expenses
- Fixed expenses are a **single monthly total number** (no itemized fixed list).
- When Plaid is connected, the backend suggests fixed total by summing recurring **outflow** streams.

## Income
- Monthly income is either user-entered or suggested by summing recurring **inflow** streams.

## Plaid connections
- Users may connect **multiple** Plaid Items.

## Manual mode
- Users can use the app without Plaid:
  - set monthly income/fixed
  - add manual spend transactions
- Users can permanently **hide/exclude** individual Plaid transactions and the choice persists across future syncs.

## Notifications
- None in MVP.

## Domain + OAuth redirect
- Domain: `today.money`
- OAuth redirect landing: `https://today.money/plaid`

## Default timezone
- Default: **America/Los_Angeles**
- Users may later change timezone via API.
