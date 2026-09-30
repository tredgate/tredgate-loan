---
id: KI-003
title: Amount as String Bypassed Validation
section: Known Issues
tags: [amount, validation, 400, type-check, import-script, NaN]
updated: 2026-09-27
status: resolved
fixed_in: 1.1.0
---

# KI-003 Amount as String Bypassed Validation

## Summary

A branch used a script to post applications collected on paper straight to `POST /api/loans`. The script copied the amount column as text, so every request carried `"amount": "50000"` (a JSON string) instead of `50000` (a number). Release 1.1.0-beta accepted and stored the strings. The UI then showed a wrong Total Approved figure and, for amounts with a thousands separator, a monthly installment of `$NaN`. Classified S2 on 2026-08-24. Fixed in 1.1.0 by checking the JSON type of every numeric field.

## Symptoms

- Monthly Payment shows `$NaN` for imported rows whose amount was `"50,000"` or similar.
- Total Approved shows an absurd figure such as `$5,000,025,000`, because string amounts were concatenated rather than added.
- The API answered `201` to every import request; nothing was refused.
- In `server/data/loans.json` the amount appears in quotes: `"amount": "50000"`.

## Log signature

The `loan created` line shows the amount as a quoted string. A correct line has `"amount":50000`; an affected one has `"amount":"50000"`:

```json
{"level":30,"time":"2026-08-21T14:05:37.412Z","pid":6208,"hostname":"branch-ws-11","reqId":"c07d2e9b","loanId":"mtq8w2h1k9d3fpa","amount":"50000","termMonths":36,"msg":"loan created"}
{"level":30,"time":"2026-08-21T14:05:37.413Z","pid":6208,"hostname":"branch-ws-11","reqId":"c07d2e9b","method":"POST","url":"/api/loans","status":201,"durationMs":4,"msg":"request completed"}
```

Find every affected creation with `grep '"amount":"' logs/app.log`. No warn or error lines exist; the beta treated the request as valid.

## Root cause

The beta amount check in `shared/loanRules.ts` was written for the form, not for raw HTTP input:

```ts
if (!input.amount || input.amount <= 0) {
  throw new LoanValidationError('Amount must be greater than 0')
}
```

For `"50000"`, `!input.amount` is false (a non-empty string is truthy) and `"50000" <= 0` is false (the comparison converts the string to 50000), so the check passed; for `"50,000"` the conversion yields `NaN`, `NaN <= 0` is false, and it passed too. Downstream, `LoanSummary.vue` computed `0 + "50000"`, which JavaScript treats as string concatenation, `calculateMonthlyPayment` computed `"50,000" * 1.08`, which is `NaN`, and `decideLoan` compared strings by conversion, so its results were unreliable.

## Fix

Release 1.1.0 made `validateLoanInput` in `shared/loanRules.ts` check types explicitly:

```ts
if (typeof input.amount !== 'number' || !(input.amount > 0)) {
  throw new LoanValidationError('Amount must be a number greater than 0')
}
```

`termMonths` must satisfy `Number.isInteger` and `interestRate` must be a `number`, so a string in any numeric field is a `400` (RB-008). Tests `rejects an amount sent as a string` (`tests/api.test.ts`) and `rejects a non-numeric amount, e.g. a string from a raw HTTP request` (`tests/loanRules.test.ts`) guard the rule.

## Workaround

On a workstation still running 1.1.0-beta, do not post to the API from scripts; enter applications through the form, which sends numbers. If string amounts are already stored, stop the server (RB-001), replace `"amount": "50000"` with `"amount": 50000` in the data file, keep the file a valid JSON array, and restart.

## Prevention

- Type checks on all numeric fields in `validateLoanInput`; the API, not the form, is the guarantee (REF-010).
- REF-010 states the JSON type of every field; RB-008 explains `Amount must be a number greater than 0` to officers and script authors.
- Any script that calls the API is reviewed by Platform Engineering before use at a branch (OPS-050).

## Related documents

REF-010 API Reference; RB-008 Validation Errors (400) Reference; REF-020 Data Model; REF-050 Testing Strategy; POL-020 Eligibility and Application Data; KI-002 and KI-004 (companion validation gaps); changelog 1.1.0.

## Timeline

- 2026-08-21: branch imports 38 paper applications with the script; all accepted.
- 2026-08-24 09:10: Operations Lead reports `$NaN` installments and a Total Approved in the billions. S2 raised.
- 2026-08-24 10:30: on-call Platform Engineer finds quoted amounts in the log and data file; script use stopped.
- 2026-08-25: data file repaired with the server stopped; 5 rows re-entered; script corrected to send numbers.
- 2026-09-04: type validation merged with tests.
- 2026-09-15: release 1.1.0; issue closed.
