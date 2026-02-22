# API Contract Delta Ledger

This file tracks any observed differences between implementation and `docs/02-api-contract.md` that may require iOS coordination.

## Status Values

- `OPEN`: mismatch identified and not yet resolved
- `ACKNOWLEDGED`: mismatch documented and accepted
- `RESOLVED`: implementation and contract aligned

## Delta Table

| Endpoint | Contract Expectation | Observed Behavior | Severity | iOS Action Required | Status |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/transactions/month` | Example shows `authorizedDate` as a date string | `authorizedDate` is `null` for manual transactions (and potentially Plaid rows without authorized date) | Medium | Treat `authorizedDate` as optional/nullable in iOS decoding | ACKNOWLEDGED |
| `GET /api/v1/health` | Contract does not define `asOf` field | Response includes `asOf` timestamp in addition to `status` | Low | None if iOS ignores unknown fields; ensure strict decoders are tolerant | ACKNOWLEDGED |

## Update Process

1. Add a row whenever behavior differs from contract docs.
2. If backend changes, update `docs/02-api-contract.md` and this ledger in the same change.
3. If iOS needs updates, include explicit parsing/model changes in `iOS Action Required`.
