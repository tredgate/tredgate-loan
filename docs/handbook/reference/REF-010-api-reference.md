---
id: REF-010
title: API Reference
section: Reference
tags: [api, http, endpoints, errors, curl, status-codes]
updated: 2026-09-27
---

# REF-010 API Reference

## Conventions: base path, JSON envelope and status codes

Tredgate Loan exposes a small HTTP API under the base path `/api`. All request and response bodies are JSON. Request bodies must carry the header `Content-Type: application/json`; the server parses no other body type.

Examples use `http://localhost:3000`, the API port in both development and single-process mode (REF-030); in development the UI on port 5173 forwards its `/api` calls to that port.

Every error response uses one envelope:

```json
{ "error": "<human-readable message>" }
```

The API uses six status codes, each paired with fixed log lines (format in OPS-060 and RB-002):

| Status | Meaning in Tredgate Loan | Log lines written for the request |
|---|---|---|
| 200 | Success for a read, a manual status change or an automated decision | `request completed` (info) |
| 201 | A new application was created and stored | `loan created` then `request completed` (info) |
| 400 | Validation failed or the body is not valid JSON | `request rejected` (warn, with `reason`) then `request completed` |
| 404 | No application with that id, or no such route under `/api` | `request rejected` (warn) then `request completed` |
| 409 | The application has already been approved or rejected | `request rejected` (warn) then `request completed` |
| 500 | Unexpected failure, most often an unreadable data file (RB-003, RB-007) | `request failed with an unexpected error` (error, with stack) then `request completed` |

Every request, successful or not, produces exactly one `request completed` line containing `method`, `url`, `status` and `durationMs`. All lines for one request share the same eight-character `reqId`. There is no API version in the path and no authentication header (see "What the API does not do").

## GET /api/health: liveness check

`GET /api/health` reports whether the API process is up. The daily checklist (OPS-030) and RB-001 use it to confirm a successful start.

Request: no body, no parameters.

```bash
curl http://localhost:3000/api/health
```

Response `200`:

```json
{ "status": "ok", "uptimeSeconds": 4 }
```

`uptimeSeconds` is the number of whole seconds since the Node.js process started, rounded to the nearest second. A value that resets unexpectedly means the process restarted.

The health endpoint does **not** read the data file and writes nothing to the log beyond the request line. Consequently it can return `200` while `GET /api/loans` returns `500` because `server/data/loans.json` is corrupted. Health means "the process answers", nothing more. To check the data path as well, call `GET /api/loans` (RB-003).

There are no error responses specific to this endpoint. If the process is not running, the client receives a connection error (for example `curl: (7) Failed to connect`), not an HTTP response.

Log lines produced by one call:

```json
{"level":30,"time":"2026-09-27T21:17:27.691Z","pid":36432,"hostname":"branch-ws-07","reqId":"e9ea951e","method":"GET","url":"/api/health","status":200,"durationMs":3,"msg":"request completed"}
```

## GET /api/loans: list all applications

`GET /api/loans` returns every application in the data file, in file order: the seed records first, then applications in the order they were created. There is no filtering, sorting or paging; the UI computes its summary counters from this list.

```bash
curl http://localhost:3000/api/loans
```

Response `200`, an array of `LoanApplication` records (field definitions in REF-020). With the standard seed the first record is:

```json
[
  {
    "id": "ln-1001",
    "applicantName": "Amara Ndlovu",
    "amount": 25000,
    "termMonths": 24,
    "interestRate": 0.08,
    "status": "approved",
    "createdAt": "2026-08-03T09:15:00.000Z"
  }
]
```

followed by `ln-1002` to `ln-1006` (full seed in REF-020). An empty data file containing `[]` yields `[]` with status `200`.

Error cases:

| Situation | Status | Body | Notes |
|---|---|---|---|
| Data file missing | 200 | seed records | The file is recreated from `server/data/loans.seed.json` on this read (RB-006) |
| Data file is not valid JSON | 500 | `{"error":"Internal server error"}` | Log shows `err.type` `SyntaxError`; follow RB-003 |
| Data file unreadable (permissions) | 500 | `{"error":"Internal server error"}` | Log shows the `EACCES` error; follow RB-007 |

Log lines: one `request completed` line with `status` 200. On failure, a level-50 `request failed with an unexpected error` line precedes it, carrying `err.type`, `err.message` and `err.stack`.

## POST /api/loans: create an application

`POST /api/loans` creates a new application in status `pending`. The body carries the four `CreateLoanInput` fields (REF-020); the server adds `id`, `status` and `createdAt`.

| Field | Type | Rule enforced by the server (POL-020) | 400 message when violated |
|---|---|---|---|
| (whole body) | object | Must be a JSON object, sent with `Content-Type: application/json` | `Request body must be a JSON object` |
| `applicantName` | string | Required; must not be empty after trimming | `Applicant name is required` |
| `amount` | number | Must be a JSON number greater than 0 | `Amount must be a number greater than 0` |
| `termMonths` | number | Must be a whole number greater than 0 | `Term months must be a whole number greater than 0` |
| `interestRate` | number | Must be a JSON number from 0 to 1 inclusive; `0.08` means 8% p.a. | `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)` |

Before these rules, the body itself must be a JSON object; then the rules are checked in this order and the first failure is reported. Numbers sent as strings (`"25000"`) fail the type check (KI-003). Leading and trailing spaces in `applicantName` are removed before storage. Unknown fields are ignored and never stored. The product range of the Simple Personal Loan (1,000 to 250,000 USD, 6 to 84 months) is **not** enforced here; officers apply it manually (POL-020).

```bash
curl -X POST http://localhost:3000/api/loans \
  -H "Content-Type: application/json" \
  -d '{"applicantName":"Alice Smith","amount":25000,"termMonths":12,"interestRate":0.05}'
```

Response `201`:

```json
{
  "id": "mukbkr5mah4k1bl",
  "applicantName": "Alice Smith",
  "amount": 25000,
  "termMonths": 12,
  "interestRate": 0.05,
  "status": "pending",
  "createdAt": "2026-09-27T21:17:27.802Z"
}
```

Error cases:

| Situation | Status | `error` message |
|---|---|---|
| Any rule above violated | 400 | The message from the table above |
| Body is not valid JSON | 400 | Parser message, e.g. `Expected property name or '}' in JSON at position 2 (line 1 column 3)` |
| No body, or body sent without `Content-Type: application/json` | 400 | `Request body must be a JSON object` (before 1.1.0 this case returned 500, see KI-004) |
| Data file corrupted | 500 | `Internal server error` (RB-003) |

Requests without the header are not parsed and fail the body check; always send the header. RB-008 explains each 400 message to officers.

Log lines for a successful call (the `loan created` line omits `applicantName`, which is personal data under POL-070):

```json
{"level":30,"time":"2026-09-27T21:17:27.803Z","pid":36432,"hostname":"branch-ws-07","reqId":"15125368","loanId":"mukbkr5mah4k1bl","amount":25000,"termMonths":12,"msg":"loan created"}
{"level":30,"time":"2026-09-27T21:17:27.803Z","pid":36432,"hostname":"branch-ws-07","reqId":"15125368","method":"POST","url":"/api/loans","status":201,"durationMs":1,"msg":"request completed"}
```

## PATCH /api/loans/:id/status: manual approve or reject

`PATCH /api/loans/:id/status` records a manual decision on a pending application. It is what the check-mark and cross buttons in the UI call. The body has one field:

```json
{ "status": "approved" }
```

or `{ "status": "rejected" }`. No other value, and no other field, is accepted. The system does not check who is deciding; approval authority by amount is a procedural rule under POL-050, evidenced in the Decision Register.

```bash
curl -X PATCH http://localhost:3000/api/loans/ln-1003/status \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'
```

Response `200`, the updated record:

```json
{
  "id": "ln-1003",
  "applicantName": "Jana Nováková",
  "amount": 60000,
  "termMonths": 48,
  "interestRate": 0.09,
  "status": "approved",
  "createdAt": "2026-09-02T08:05:00.000Z"
}
```

`createdAt` is unchanged; the system stores neither the decision time nor the decision maker (REF-020).

Error cases, checked in this order:

| Situation | Status | `error` message |
|---|---|---|
| `status` missing, not a string, or any value other than `approved`/`rejected`; also when the body is missing or lacks the JSON header | 400 | `Status must be 'approved' or 'rejected'` |
| Body is not valid JSON | 400 | Parser message |
| No application with this id | 404 | `Loan with id <id> not found`, e.g. `Loan with id zzz not found` |
| Application already decided | 409 | `Loan with id <id> has already been decided (approved)` or `... (rejected)` |
| Data file corrupted | 500 | `Internal server error` |

Because the status value is validated before the application is looked up, a bad status on an unknown id returns 400, not 404. A 409 means the decision is final: create a new application instead (POL-050).

Log lines for a successful call:

```json
{"level":30,"time":"2026-09-27T21:17:27.845Z","pid":36432,"hostname":"branch-ws-07","reqId":"61ac2f67","loanId":"ln-1003","status":"approved","msg":"loan status updated"}
{"level":30,"time":"2026-09-27T21:17:27.845Z","pid":36432,"hostname":"branch-ws-07","reqId":"61ac2f67","method":"PATCH","url":"/api/loans/ln-1003/status","status":200,"durationMs":1,"msg":"request completed"}
```

## POST /api/loans/:id/auto-decide: automated decision

`POST /api/loans/:id/auto-decide` applies the standard risk envelope of POL-040 to a pending application. It is what the lightning-bolt button in the UI calls. No request body is needed.

The rule, implemented by `decideLoan` in `shared/loanRules.ts`, is:

- `approved` when `amount <= 100000` **and** `termMonths <= 60` (both inclusive);
- `rejected` otherwise.

Interest rate and applicant play no part. Auto-decide never escalates: outside the envelope it rejects rather than leaving the application pending. A non-standard application that should be approved needs a manual decision under POL-050, not auto-decide.

```bash
curl -X POST http://localhost:3000/api/loans/ln-1004/auto-decide
```

Response `200`. Seed record `ln-1004` (100,000 USD over 60 months) sits exactly on both limits and is approved:

```json
{
  "id": "ln-1004",
  "applicantName": "Sipho Dlamini",
  "amount": 100000,
  "termMonths": 60,
  "interestRate": 0.085,
  "status": "approved",
  "createdAt": "2026-09-14T15:22:00.000Z"
}
```

Worked examples of the outcome:

| Application | Amount | Term | Result |
|---|---|---|---|
| ln-1004 | 100,000 | 60 | approved (on both limits) |
| new | 100,001 | 60 | rejected (amount) |
| new | 50,000 | 61 | rejected (term) |
| new | 150,000 | 72 | rejected (both) |

Error cases:

| Situation | Status | `error` message |
|---|---|---|
| No application with this id | 404 | `Loan with id <id> not found` |
| Application already decided | 409 | `Loan with id ln-1001 has already been decided (approved)` |
| Data file corrupted | 500 | `Internal server error` |

Log lines for a successful call; the `status` field shows the outcome:

```json
{"level":30,"time":"2026-09-27T21:17:27.839Z","pid":36432,"hostname":"branch-ws-07","reqId":"814c3ec7","loanId":"ln-1004","status":"approved","msg":"loan auto-decided"}
{"level":30,"time":"2026-09-27T21:17:27.839Z","pid":36432,"hostname":"branch-ws-07","reqId":"814c3ec7","method":"POST","url":"/api/loans/ln-1004/auto-decide","status":200,"durationMs":1,"msg":"request completed"}
```

## Unknown routes and malformed JSON

**Unknown routes.** Any method and path under `/api` other than the five endpoints returns `404` with a JSON body naming the method and the full path, query string included:

```bash
curl -X DELETE http://localhost:3000/api/loans/ln-1001
# {"error":"Route DELETE /api/loans/ln-1001 not found"}

curl "http://localhost:3000/api/whatever?x=1"
# {"error":"Route GET /api/whatever?x=1 not found"}
```

`GET /api/loans/ln-1001` (no single-record endpoint) and `DELETE /api/loans/<id>` (no delete) are the usual mistakes; both return this 404.

Paths **outside** `/api` behave differently: in single-process mode they are served from the built UI in `dist/`; in API-only development mode (`npm run dev:api`) they return Express's default plain 404 without a JSON body, which is expected.

**Malformed JSON.** When the body cannot be parsed, the JSON parser's own error is returned as `400` in the standard envelope:

```bash
curl -X POST http://localhost:3000/api/loans -H "Content-Type: application/json" -d '{ not json'
# {"error":"Expected property name or '}' in JSON at position 2 (line 1 column 3)"}
```

The wording comes from the Node.js runtime and varies between versions, so scripts must test the status code, never the text. A body that is valid JSON but not an object (for example `"hello"`) is rejected the same way. Other parser failures keep the parser's own status code; the only one seen in practice is `413 request entity too large` for a body above the 100 kB default limit.

All of these are logged as `request rejected` at level 40 with the message in `reason`, followed by `request completed`:

```json
{"level":40,"time":"2026-09-27T21:17:27.721Z","pid":36432,"hostname":"branch-ws-07","reqId":"d5eb9fc5","status":400,"reason":"Expected property name or '}' in JSON at position 2 (line 1 column 3)","msg":"request rejected"}
```

## What the API does not do

Release 1.1 keeps the API deliberately small. The following are not available, stated plainly so that no procedure is built around a feature that does not exist.

- **No authentication or authorization.** Anyone who can reach the port can create and decide applications, so the workstation must not expose port 3000 (or 5173) beyond the local machine. Role limits and the four-eyes rule are enforced procedurally through the Decision Register (POL-050, OPS-010), not by the system.
- **No pagination, filtering or sorting.** `GET /api/loans` always returns the whole file; there is no single-record `GET /api/loans/:id`.
- **No delete.** An application stays in the data file until the retention procedure of POL-070 removes it. A mistaken pending application is rejected manually.
- **No edit.** `applicantName`, `amount`, `termMonths` and `interestRate` cannot be changed after creation. A typo means a new application; the wrong one is rejected.
- **No change of a decision.** Approved and rejected applications are final; every attempt returns `409`. Reversing a decision means a new application and an entry in the Decision Register.
- **No decision metadata.** Who decided, when and why is not stored; only `status` changes. The log holds `loanId`, `status` and a timestamp per decision (RB-002); the Decision Register holds the signatures.
- **No installment calculation endpoint.** The monthly installment is computed in the UI with the flat-rate formula of POL-030 (`amount x (1 + interestRate) / termMonths`); the API never returns it.
- **No product-range check.** Amounts and terms outside the SPL range are accepted if they are valid numbers (POL-020).
- **No disbursement, repayment or arrears data.** These live in Tredgate Core Banking; identity checks live in KYC Desk.
