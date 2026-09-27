---
id: KI-002
title: Interest Rate Entered as Percentage
section: Known Issues
tags: [interest-rate, validation, 400, installment, data-entry]
updated: 2026-09-27
status: resolved
fixed_in: 1.1.0
---

# KI-002 Interest Rate Entered as Percentage

## Summary

Tredgate Loan stores the annual interest rate as a fraction: `0.08` means 8% p.a. (POL-030). In releases 1.0.0 and 1.1.0-beta an officer could enter `8` instead of `0.08` and the system accepted it. The application then showed a monthly installment roughly eight to nine times too high and a rate of `800.0%`, with no error anywhere. Two branches reported it between July and August 2026 (S3). Fixed in 1.1.0 by rejecting any rate outside 0 to 1.

## Symptoms

- Monthly Payment far above expectation: 25,000 USD over 12 months at Band C should show `$2,250.00`; entered with `8` it showed `$18,750.00`.
- The Rate column reads `800.0%` instead of `8.0%`.
- No error in the form, no 400 from the API, no banner.
- The record was often decided before anyone noticed; auto-decide ignores the rate (POL-040).

## Log signature

None. The request was valid to the beta code, so the log shows an ordinary creation and nothing at warn or error; the `loan created` line does not contain the rate:

```json
{"level":30,"time":"2026-07-14T10:22:41.530Z","pid":5120,"hostname":"branch-ws-03","reqId":"a41f7c02","loanId":"mt3k8z1qv7wn2ro","amount":25000,"termMonths":12,"msg":"loan created"}
{"level":30,"time":"2026-07-14T10:22:41.531Z","pid":5120,"hostname":"branch-ws-03","reqId":"a41f7c02","method":"POST","url":"/api/loans","status":201,"durationMs":3,"msg":"request completed"}
```

Affected records are found in the data, not the log: `grep -n '"interestRate": [1-9]' server/data/loans.json` lists every stored rate of 1 or more.

## Root cause

The beta validation in `shared/loanRules.ts` checked only the lower bound:

```ts
if (input.interestRate === undefined || input.interestRate < 0) {
  throw new LoanValidationError('Interest rate cannot be negative')
}
```

Any non-negative number passed, including `8`, `12` and `100`. The form field in `LoanForm.vue` had no upper limit and its label read only `Interest Rate`, so nothing told the officer which unit was expected. `calculateMonthlyPayment` then did what it was asked: 25,000 x (1 + 8) / 12 = 18,750.

## Fix

Release 1.1.0 tightened `validateLoanInput` in `shared/loanRules.ts`:

```ts
if (typeof input.interestRate !== 'number' || !(input.interestRate >= 0 && input.interestRate <= 1)) {
  throw new LoanValidationError('Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)')
}
```

The API now answers `400` with that message (RB-008). `LoanForm.vue` labels the field `Interest Rate (e.g., 0.08 for 8%)` and limits it with `min="0"` and `max="1"`, so the browser refuses `8` before a request is sent. Tests `rejects an interest rate above 1, e.g. 8 instead of 0.08` and `rejects a negative interest rate` in `tests/loanRules.test.ts` guard the rule.

## Workaround

An application cannot be edited (REF-010). If the mis-entered application is still pending, reject it and create a new one with the correct fraction. If it was already approved, create a corrected application, approve it with the authority POL-050 requires, and record both entries in the Decision Register; inform Credit Risk if the wrong figure has reached Tredgate Core Banking.

## Prevention

- Server-side range check in `validateLoanInput`; the UI limit is a convenience, the API is the guarantee.
- POL-030 lists every rate band as a fraction (Band A 0.05 to Band E 0.12) and states "always a fraction between 0 and 1".
- The release checklist in REF-050 includes entering `8` and confirming it is refused.

## Related documents

POL-030 Interest Rates and Installments; RB-008 Validation Errors (400) Reference; REF-010 API Reference; REF-050 Testing Strategy; changelog 1.1.0.

## Timeline

- 2026-06-15: release 1.0.0; rate accepted without an upper bound.
- 2026-07-14: first report from a branch: installment of 18,750 USD on a 25,000 USD application. Classified S3, workaround issued.
- 2026-08-05: second report from another branch; Credit Risk asks for a system check.
- 2026-08-28: fix merged with the shared validation rule and tests.
- 2026-09-15: release 1.1.0; legacy records with a rate of 1 or more reviewed with Credit Risk; issue closed.
