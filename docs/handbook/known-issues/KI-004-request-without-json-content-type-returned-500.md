---
id: KI-004
title: Request Without JSON Content Type Returned 500
section: Known Issues
tags: [api, validation, content-type, 500, 400, scripts]
updated: 2026-09-27
status: resolved
fixed_in: 1.1.0
---

# KI-004 Request Without JSON Content Type Returned 500

## Summary

A `POST /api/loans` request that carried a JSON body but no `Content-Type: application/json` header made the API answer `500 {"error":"Internal server error"}` instead of a validation error. The request came from a branch import script that built its own HTTP call. Nothing was stored and no data was damaged, but the branch treated the 500 as an outage until the log was read. Fixed in 1.1.0: such requests now receive `400 {"error":"Request body must be a JSON object"}`. Investigation followed runbook RB-007; the walk-through in that runbook is this incident.

## Symptoms

- Every call from the import script failed with `500 {"error":"Internal server error"}` while the same application entered through the New Loan Application form was created normally.
- The UI kept working, the health endpoint returned 200 and `GET /api/loans` listed applications, so the fault was limited to requests without the header.
- The log showed one level 50 line per failed call and no `loan created` line.

## Log signature

```json
{"level":50,"time":"2026-09-24T08:42:17.402Z","pid":4127,"hostname":"branch-ws-03","reqId":"3f9c2b71","err":{"type":"TypeError","message":"Cannot read properties of undefined (reading 'applicantName')","stack":"TypeError: Cannot read properties of undefined (reading 'applicantName')\n    at validateLoanInput (/opt/tredgate-loan/shared/loanRules.ts:30:20)\n    at Object.create (/opt/tredgate-loan/server/loanService.ts:16:7)"},"msg":"request failed with an unexpected error"}
{"level":30,"time":"2026-09-24T08:42:17.403Z","pid":4127,"hostname":"branch-ws-03","reqId":"3f9c2b71","method":"POST","url":"/api/loans","status":500,"durationMs":3,"msg":"request completed"}
```

The pair to look for is a `TypeError` mentioning `reading 'applicantName'` in `validateLoanInput`, followed by a `request completed` line with status 500 and the same `reqId`.

## Root cause

The JSON body parser (`express.json()` in `server/app.ts`) only parses requests that declare `Content-Type: application/json`. For any other content type it leaves `req.body` undefined. The create route passed that undefined value straight into `validateLoanInput` in `shared/loanRules.ts`, whose first rule read `input.applicantName` and threw a `TypeError`. The error handler in `server/errors.ts` correctly classified an unknown error as a 500, so the client saw an internal error for what was a malformed request.

## Fix

`validateLoanInput` now starts with a body check: when the input is not an object, it throws `LoanValidationError('Request body must be a JSON object')`, which the error handler maps to 400 like every other validation error. The test "rejects a request without a JSON body with 400" in `tests/api.test.ts` sends a form-encoded body without the header and asserts the 400 and the message; "rejects a missing body" in `tests/loanRules.test.ts` covers the rule directly. Reference RB-008 lists the new message.

## Workaround

Before 1.1.0: add `-H "Content-Type: application/json"` to every scripted call. This remains the correct way to call the API; the fix only turns the mistake into a clear 400.

## Prevention

- Script templates in REF-010 include the header; scripts are reviewed against them before first use at a branch.
- Any new route that reads `req.body` must pass through a validator that tolerates a missing body; the API test suite keeps a test for the header-less case.
- A 500 for a request that a human would call "wrong input" is a defect by the standard in RB-008 and is investigated with RB-007.

## Related documents

- RB-007 Investigating a 500 Error (walk-through of this incident)
- RB-008 Validation Errors (400) Reference
- REF-010 API Reference
- KI-003 Amount as String Bypassed Validation (the other script-originated defect)
- OPS-050 Change Management and Releases

## Timeline

| When | What |
|---|---|
| 2026-09-24 08:42 | First 500 from the branch import script; branch reports "the API is down" |
| 2026-09-24 08:55 | Operations Lead confirms the UI works and escalates as S3 with the reqId |
| 2026-09-24 09:20 | Platform Engineering reads the stack trace, reproduces with curl, header added to the script (workaround) |
| 2026-09-24 11:00 | Failing test written, body guard added, tests and lint pass |
| 2026-09-25 | Change merged; shipped in 1.1.0 |
