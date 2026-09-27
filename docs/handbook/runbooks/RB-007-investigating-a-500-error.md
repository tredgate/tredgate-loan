---
id: RB-007
title: Investigating a 500 Error
section: Runbooks
tags: [500, internal-server-error, triage, reqId, stack-trace, reproduce, failing-test, known-issue, release]
updated: 2026-09-27
---

# RB-007 Investigating a 500 Error

## Symptoms

An unexpected error in Tredgate Loan always looks the same from the outside and differs only in the log:

- The API answers `500` with `{"error":"Internal server error"}`; by design the stack trace exists only in the log.
- The UI shows "Failed to load loan applications: Internal server error" (list request), "Action failed: Internal server error" (decision request) or "Internal server error" inside the New Loan Application form (creation).
- `logs/app.log` contains a level 50 line with `"msg":"request failed with an unexpected error"` and an `err` object (`type`, `message`, `stack`), followed by the `request completed` line of the same `reqId` with `"status":500`.
- `GET /api/health` usually still returns 200; it only reports uptime.

A 500 is always a defect or an environment fault, never a valid business outcome; expected rejections (400, 404, 409) are level 40 `request rejected` lines covered by RB-008. A level 50 line with `err.type` `SyntaxError` and a frame in `server/loanStore.ts` means a corrupted data file: use RB-003 first.

## When to use this runbook

Use this runbook for any level 50 line that is not the corrupted-data-file signature of RB-003, and for any "Internal server error" reported by an officer. It is Platform Engineering's triage procedure: capture, locate, understand, reproduce, isolate, fix with a test, release, record.

Severity per OPS-040: every request failing during business hours is an S1; a single failing action is S2 if officers cannot complete decisions and S3 if a workaround exists (for example the UI instead of a script). Notify the Operations Lead in all cases; S1 and S2 need a postmortem.

The outcome is always a Known Issue entry written with the template in `docs/handbook/known-issues/README.md` (symptom, log signature, root cause, fix, prevention), even for environmental causes, so the next engineer finds the signature by searching the handbook.

## Prerequisites

- The time of the failure as reported by the officer (local time; log times are UTC) and what the officer did: which button or script, on which application, with which values.
- Read access to `logs/app.log` and the commands from RB-002.
- A checkout of the repository at the released version with `npm install` done, so that `npm test` and `npm run lint` run, plus a private instance for reproduction (`DATA_FILE` and `LOG_FILE` in a scratch folder, `PORT` on a spare port) so the branch's live process is not disturbed.
- `curl` for repeating requests exactly.
- Authority to release per OPS-050.
- The Known Issues template and the next free KI number from the register.

## Diagnosis

1. Capture the report: local time, URL, exact banner text, application id if visible, the action; convert the time to UTC.

2. Find the failure line and its `reqId`:

   ```bash
   grep -n '"level":50' logs/app.log | tail -n 5
   ```

   Pick the line whose `time` matches the report and note its `reqId`.

3. Read the error: `err.type` and `err.message` say what went wrong; the first frame of `err.stack` under `shared/` or `server/` says where. With `jq`: `jq -r 'select(.reqId=="<reqId>") | .err.stack' logs/app.log`.

4. Collect the request context with `grep '<reqId>' logs/app.log`: the `request completed` line gives `method`, `url` and `durationMs`; an event line (`loan created`, `loan status updated`) with the same `reqId` means the write succeeded before the failure.

5. Read the lines before the failure (`grep -n -B 10 '<reqId>' logs/app.log`) for what preceded it: a startup line with a different `dataFile`, a burst of rejections.

6. Reproduce with `curl` against a private instance (`PORT=3999 DATA_FILE=/tmp/rb7/loans.json LOG_FILE=/tmp/rb7/app.log npx tsx server/index.ts`), using the client's exact method, URL, headers and body, until you get the same `err.message`.

7. Validate the data file (RB-003) and compare the affected record with REF-020.

8. Isolate the failing function at the stack frame and write down which input makes it throw.

## Resolution

1. Write a failing test first, in `tests/api.test.ts` (HTTP behavior) or `tests/loanRules.test.ts` (business rules), that sends the reproduced input and asserts the expected outcome, usually a 400 instead of a 500. `npm test` must fail with the same error as the log.
2. Fix the code with the smallest change, keeping the rule that expected rejections raise `LoanValidationError` or `HttpError` (mapped to 4xx) and only genuine faults reach the error handler as 500.
3. Run `npm test` and `npm run lint`; both must pass (31 tests in version 1.1.0 plus the new one).
4. Write the Known Issue entry from the template, quoting the exact `err.message` and the first stack frame so the signature is searchable.
5. Release per OPS-050 and add a line to `changelog.md`; until then, give the Operations Lead the workaround.

**Worked example.** On 2026-09-24 at 10:42 local time (08:42 UTC) a Loan Officer at `branch-ws-03` reported that the branch's `curl`-based import script received "Internal server error" for every record, while the same values entered in the UI worked. The log showed:

```json
{"level":50,"time":"2026-09-24T08:42:17.402Z","pid":4127,"hostname":"branch-ws-03","reqId":"3f9c2b71","err":{"type":"TypeError","message":"Cannot read properties of undefined (reading 'applicantName')","stack":"TypeError: Cannot read properties of undefined (reading 'applicantName')\n    at validateLoanInput (/opt/tredgate-loan/shared/loanRules.ts:30:20)\n    at Object.create (/opt/tredgate-loan/server/loanService.ts:16:7)\n    at <anonymous> (/opt/tredgate-loan/server/app.ts:35:30)"},"msg":"request failed with an unexpected error"}
{"level":30,"time":"2026-09-24T08:42:17.405Z","pid":4127,"hostname":"branch-ws-03","reqId":"3f9c2b71","method":"POST","url":"/api/loans","status":500,"durationMs":3,"msg":"request completed"}
```

The frame `shared/loanRules.ts:30:20` is the first check in `validateLoanInput`, reading `input.applicantName`; `undefined` there means the body was never parsed. The script sent JSON without a `Content-Type: application/json` header. Reproduced on a private instance:

```bash
curl -s -X POST http://localhost:3999/api/loans -d '{"applicantName":"Alice Smith","amount":25000,"termMonths":12,"interestRate":0.05}'
{"error":"Internal server error"}
```

Adding `-H "Content-Type: application/json"` produced `201`. Root cause: the JSON body parser only parses requests that declare that content type, so `req.body` is undefined and the validator dereferences it. The workaround (add the header) reached the branch within the hour. The fix added the failing test "rejects a request without a JSON body with 400" to `tests/api.test.ts` and a guard at the top of `validateLoanInput` in `shared/loanRules.ts` that reports a missing or non-object body as the 400 validation error `Request body must be a JSON object`; `npm test` and `npm run lint` passed, the incident was recorded as KI-004 from the template, and the change shipped in 1.1.0 per OPS-050.

## Verification

1. The new test fails on the old code and passes on the fixed code; `npm test` and `npm run lint` pass.
2. On a private instance running the fixed code, the reproduced `curl` request returns the expected 4xx JSON (in the worked example a 400 with a validation message), and the log shows a level 40 `request rejected` line instead of a level 50 line.
3. After the release is installed at the branch (RB-001), the officer repeats the original action; the log shows a non-500 `request completed` line and no level 50 line with the same `err.message` during the following business day.
4. The Known Issue entry exists in `docs/handbook/known-issues/`, is linked from the register's README and quotes the exact log signature.
5. `changelog.md` has the release line, and the incident record (OPS-040) references the Known Issue id and, for S1 and S2, the postmortem.

## Prevention

- Treat every level 50 line as a defect until proven otherwise, and open a Known Issue entry for each distinct `err.message`; the register is the fastest diagnosis tool.
- Keep the error handler's rule: validation and lookup failures raise `LoanValidationError` or `HttpError` and become 4xx; only genuine faults become 500. Every new input path gets a test in `tests/api.test.ts` that sends bad input and expects 4xx.
- Require the `Content-Type: application/json` header in every script that calls the API; keep script templates in REF-010.
- Never log personal data while adding diagnostics; `loanId`, amounts and statuses are enough (OPS-060, POL-070).
- Review the level 50 count in the daily checklist (OPS-030); a failure found in the morning is cheaper than one reported at noon.

## Related documents

- RB-002 Reading the Application Log: `reqId` correlation, reading `err.stack`, `grep` and `jq` commands.
- RB-003 Data File Missing or Corrupted: the `SyntaxError` 500 that is handled before this runbook.
- RB-008 Validation Errors (400) Reference: the expected rejections that must not become 500s.
- RB-001 Starting and Stopping Tredgate Loan: restarting the branch workstation after a release.
- REF-010 API Reference and REF-020 Data Model: the API contract that the reproduction must follow.
- OPS-040 Incident Management and OPS-050 Change Management and Releases: severities, postmortems, release steps.
- Known Issues README (`docs/handbook/known-issues/README.md`): the entry template; KI-001, KI-002 and KI-003 are finished examples.
