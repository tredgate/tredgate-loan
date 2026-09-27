---
id: RB-008
title: Validation Errors (400) Reference
section: Runbooks
tags: [validation, 400, 404, 409, error-messages, request-rejected, malformed-json, ki-002, ki-003]
updated: 2026-09-27
---

# RB-008 Validation Errors (400) Reference

## Symptoms

Tredgate Loan rejects a request with a 4xx status and the JSON body `{"error":"<message>"}`. Where the message appears depends on the client:

- In the New Loan Application form it is shown in red under the fields.
- For the check mark, cross and lightning-bolt buttons it appears in the red banner as "Action failed: <message>".
- For scripts and `curl` it is the `error` field of the response (status 400, 404 or 409).
- In `logs/app.log` every rejection is one level 40 line, followed by the `request completed` line with the same `reqId` and status:

  ```json
  {"level":40,"time":"2026-09-27T18:30:35.824Z","pid":10791,"hostname":"branch-ws-07","reqId":"18e15ee8","status":400,"reason":"Applicant name is required","msg":"request rejected"}
  ```

Rejections are expected outcomes, not faults. The system validates data shape (types, ranges, known ids, allowed transitions), not product fit: 500,000 USD or 120 months is accepted and must be rejected manually per POL-020. Only the first failing rule is reported (order: applicant name, amount, term, interest rate).

## When to use this runbook

Use this reference to translate a message into its cause and correction, to confirm from a level 40 log line what a client sent, and to decide whether a rejection is a client mistake or a defect.

The messages come from `shared/loanRules.ts` (new application), `server/app.ts` (status value), `server/loanService.ts` (unknown or decided application) and `server/errors.ts` (unknown route, JSON parser pass-through). The wording is identical in the UI, in scripts and in the log's `reason` field, so it works as a search key.

Do not use this runbook for `{"error":"Internal server error"}` (500), which belongs to RB-007. The form also has its own client-side checks with slightly different wording ("Amount must be greater than 0", "Interest rate is required and cannot be negative"); those never reach the API or the log.

## Prerequisites

- The exact message text, copied rather than paraphrased.
- For scripts: the exact request sent (method, URL, headers, body); `curl -v` prints all of them.
- For the UI: the field values entered, or the button clicked and the application id.
- Access to `logs/app.log` to find the level 40 line by time or `reqId` (RB-002).
- The data model (REF-020): `applicantName` string, `amount` number in USD, `termMonths` whole number, `interestRate` number between 0 and 1, `status` one of `pending`, `approved`, `rejected`. JSON numbers are unquoted: `25000`, not `"25000"`.
- The rate bands of POL-030 (Band A 0.05, B 0.065, C 0.08, D 0.095, E 0.12), to judge whether an accepted rate is also a plausible one.

## Diagnosis

All examples go to `http://localhost:3000` with `-H "Content-Type: application/json"`; for `POST /api/loans`, "with" means the valid body `{"applicantName":"Alice Smith","amount":25000,"termMonths":12,"interestRate":0.05}` with that one field changed.

| Status | Message | Condition | Example request | Correction |
|---|---|---|---|---|
| 400 | `Request body must be a JSON object` | Body missing or not a JSON object, almost always because the request lacked the `Content-Type: application/json` header | `POST /api/loans` with a JSON body but without the header | Add the header; scripts must always send it (KI-004) |
| 400 | `Applicant name is required` | `applicantName` missing, not a string, or blank | `POST /api/loans` with `"applicantName":"  "` | Enter the name |
| 400 | `Amount must be a number greater than 0` | `amount` missing, a string, 0 or negative | `POST /api/loans` with `"amount":"25000"` | Send a JSON number greater than 0 (KI-003) |
| 400 | `Term months must be a whole number greater than 0` | `termMonths` missing, a string, 0, negative or fractional | `POST /api/loans` with `"termMonths":12.5` | Use a whole number of months |
| 400 | `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)` | `interestRate` missing, a string, negative or above 1 | `POST /api/loans` with `"interestRate":8` | Send a fraction, 0.08 for 8% (KI-002) |
| 400 | `Status must be 'approved' or 'rejected'` | PATCH body missing, or `status` not exactly `approved` or `rejected` | `PATCH /api/loans/ln-1003/status -d '{"status":"maybe"}'` | Send exactly `approved` or `rejected`, lowercase |
| 400 | Parser message, e.g. `Expected property name or '}' in JSON at position 2 (line 1 column 3)` | Body declared as JSON but not valid JSON | `POST /api/loans -d '{ not json'` | Fix the quoting; wording varies by Node.js version |
| 404 | `Loan with id does-not-exist not found` | No application with that id | `PATCH /api/loans/does-not-exist/status -d '{"status":"approved"}'` | Take the id from `GET /api/loans`; ids are case-sensitive |
| 404 | `Route GET /api/whatever not found` | Path or method not in REF-010 (for example `PUT`) | `GET /api/whatever` | Use the routes in REF-010 |
| 409 | `Loan with id ln-1001 has already been decided (approved)` | Decision attempted on a non-pending application; parenthesis shows its current status | `PATCH /api/loans/ln-1001/status -d '{"status":"rejected"}'` | Decisions are final (POL-050); create a new application instead |

## Resolution

1. Correct the input and repeat: in the form, fix the named field and click Create Application again; for decision buttons, click Retry and read the current status; in scripts, fix the field and re-run the failed records.
2. For the amount message from a script, look for quoted numbers (`"amount":"50000"`), usually from spreadsheet exports (KI-003).
3. For the interest rate message, divide percentages by 100 and check the value against the bands in POL-030; a rate of exactly 1 (100%) is accepted by the system but outside every band.
4. For a 409, do nothing to the application; if the decision is wrong, the officer creates a new application and records the reason in the Decision Register (POL-050).
5. For a 404 on an id, use an id from `GET /api/loans`; an id seen earlier may have been removed by a reset (RB-006).
6. For the JSON parser message, validate the body locally with `node -e 'JSON.parse(process.argv[1])' '<body>'`, which prints nothing for valid JSON.
7. For `Route ... not found`, compare with REF-010: `/api/loans`, `/api/loans/:id/status` (PATCH only) and `/api/loans/:id/auto-decide` (POST only).

## Verification

`grep '"reason":"<message>"' logs/app.log` lists every occurrence of a message with time and `reqId`. The rejection is resolved when the repeated request succeeds (`201` for `POST /api/loans`, `200` for `PATCH .../status` and `POST .../auto-decide`) and the log shows a level 30 event line plus a `request completed` line with that status, and no further level 40 line with the same `reason`.

A 400 is a defect rather than a user error when the client could not have sent anything else:

- The message appears in the New Loan Application form for values that look correct. The form sends JSON numbers (`v-model.number`) and the browser's constraint validation (`required`, `min`, `max`, `step`) blocks empty, negative, fractional-term and above-1 rate values before submission, so a server-side message for an ordinary entry points to a UI defect (for example a field sending `"25000"` as a string). Reproduce with `curl`, write a failing test in `tests/api.test.ts` and follow RB-007.
- The reverse case: a request that should get 400 returns `500 {"error":"Internal server error"}`. Before 1.1.0 a `POST /api/loans` without the `Content-Type: application/json` header did exactly that (KI-004); it now returns `Request body must be a JSON object`. Any new case of this kind belongs to RB-007.

Count rejections per day (`grep -c '"level":40' logs/app.log`, OPS-060); a sudden rise for one `reason` usually means a changed script or new officer.

## Prevention

- Teach the rate convention explicitly, 0.08 not 8, during onboarding (POL-030, KI-002).
- Scripts send JSON numbers, include `Content-Type: application/json` and validate the body locally (KI-003); keep a template request in REF-010.
- Do not retry automatically after a 409; the application is already decided, so refresh the list instead.
- Keep validation in `shared/loanRules.ts`, covered by tests in `tests/`; message changes go through OPS-050 and must update this document.
- The system checks data shape only; product range (1,000 to 250,000 USD, 6 to 84 months) and rate bands are checked by officers (POL-020, POL-030). Passing validation is not an approval.

## Related documents

- REF-010 API Reference and REF-020 Data Model: routes, bodies, field types and statuses.
- POL-020 Eligibility and Application Data: product range checked by officers, not by the system.
- POL-030 Interest Rates and Installments: rate bands and the fraction convention.
- POL-050 Manual Decisions and Approval Authority: decisions are final, which explains 409.
- KI-002 Interest Rate Entered as Percentage and KI-003 Amount as String Bypassed Validation: the incidents behind two of the messages.
- RB-002 Reading the Application Log: finding `request rejected` lines by `reason` or `reqId`.
- RB-007 Investigating a 500 Error: when a rejection is a defect, or a 400 case returns 500.
