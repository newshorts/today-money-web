# Budget Engine — today-money-web

This is the canonical definition of “Remaining Today” and “Tomorrow Preview”.

## Inputs
- User timezone (default `America/Los_Angeles`)
- Monthly Income (cents, USD)
- Monthly Fixed (cents, USD)
- Variable spend transactions for the current calendar month (pending included)

## Month boundaries
All “month” queries use the user timezone.

- Current month = from local midnight on day 1 to local 23:59:59 on last day.
- “Today” = local date.

## Discretionary monthly
`discretionary = incomeMonthlyCents - fixedMonthlyCents`

Can be negative (the UI should still function; remaining can go negative).

## Cents-exact daily distribution
To avoid rounding drift, distribute discretionary into daily allowances that sum exactly:

Let:
- `D = daysInMonth`
- `base = floor(discretionary / D)`
- `remainder = discretionary - base * D`  (0..D-1)

Daily allowance for day index `d` in [1..D]:
- `allowance(d) = base + (d <= remainder ? 1 : 0)`

Accrued-to-date at start of day `t` (t in [1..D]):
- `accruedToDate(t) = base * t + min(t, remainder)`

## Effective transaction date
For spend attribution, define:
- `effectiveDate = authorizedDate ?? date`

## Variable spend set
Include only transactions that:
- are in current month by `effectiveDate`
- are not hidden (`isHidden=false`)
- are not removed by Plaid (`isRemovedByPlaid=false`)
- have `isSuperseded=false`
- have `budgetImpact == VARIABLE`

Pending transactions are included (pending counts as spent).

Transfers must never be VARIABLE.

Refunds default to INCOME_EXCLUDED; user can override a refund to VARIABLE if they want it to restore budget.

## Summary computation
Let:
- `t = todayDayIndex`
- `spentBeforeToday = sum(amountCents for VARIABLE where effectiveDate < today)`
- `spentToday = sum(amountCents for VARIABLE where effectiveDate == today)`

Then:
- `availableStartOfDay = accruedToDate(t) - spentBeforeToday`
- `remainingToday = availableStartOfDay - spentToday`

Tomorrow preview:
- if today is not last day of month:
  - `tomorrowPreview = allowance(t+1) + remainingToday`
- else (last day):
  - `tomorrowPreview = allowanceNextMonth(1) + remainingToday`
  - Note: allowanceNextMonth uses the same income/fixed unless changed at month boundary.

## Examples
If base daily is $10.00 and remaining today is $3.00:
- tomorrow preview = $13.00

If remaining today is -$5.00:
- tomorrow preview = $5.00

## Output payload
The endpoint `GET /api/v1/budget/summary` returns:
- allowanceToday
- spentToday
- remainingToday
- tomorrowPreview
- plus explanatory fields (daysInMonth, discretionary, timezone)
