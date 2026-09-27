---
id: OPS-060
title: Logging and Monitoring Standards
section: Operations
tags: [logging, pino, json-lines, reqId, log-levels, retention, health-check, personal-data]
updated: 2026-09-27
---

# OPS-060 Logging and Monitoring Standards

## Purpose and scope

This document is the standard for the application log of Tredgate Loan and for the monitoring Lending Operations performs on a branch workstation. It defines the log line format and every field and message the system writes, the level numbers, the correlation rule based on `reqId`, what must never be logged, retention and rotation, the daily review, and what the health checks prove.

The log is written by the pino library to two destinations at once: the terminal of the process started with `npm start` or `npm run dev`, and the file named by the `LOG_FILE` environment variable, by default `logs/app.log` in the installation folder. The `logs` folder is created at first start. The file is never committed to the repository. There is no monitoring agent, dashboard, or alerting: the log, the health endpoint, and the summary tiles are the complete monitoring surface.

## Line format and fields

Every log line is one JSON object on one line (JSON lines), appended in the order events happen.

| Field | Type | Present on | Meaning |
|---|---|---|---|
| `level` | number | every line | Severity: 30 info, 40 warn, 50 error |
| `time` | string | every line | ISO 8601 timestamp in UTC with milliseconds, for example `2026-09-27T18:30:35.822Z` |
| `pid` | number | every line | Process id of the server; changes at every restart |
| `hostname` | string | every line | Name of the branch workstation, for example `branch-ws-07` |
| `reqId` | string | every request-scoped line | 8 hexadecimal characters identifying one HTTP request |
| `msg` | string | every line | One of the eight fixed message texts in the message catalog of this document |
| event fields | varies | depends on `msg` | `port`, `dataFile`, `logFile`, `servingFrontend`, `method`, `url`, `status`, `durationMs`, `loanId`, `amount`, `termMonths`, `reason`, `err` |

The start-up lines `Tredgate Loan API started` and `Tredgate Loan API failed to start` are the only lines without a `reqId`; every other line belongs to exactly one request. The `err` field on error lines is an object with `type` (for example `SyntaxError`), `message`, and `stack`. It is the only place a stack trace ever appears, because the HTTP response for a 500 is always the fixed text `{"error":"Internal server error"}`.

## Log levels and LOG_LEVEL

| `level` | Name | Written for | Expected volume |
|---|---|---|---|
| 30 | info | Start-up, every completed request, every domain event (created, status updated, auto-decided) | Dozens to hundreds per day |
| 40 | warn | Every request answered with a 4xx: validation failure or malformed JSON (400), unknown application or route (404), decision on an already decided application (409) | A handful per day, each with a `reason` |
| 50 | error | Every request answered with a 500, such as an unreadable data file | Zero on a normal day |

A 4xx is an expected outcome and never carries a stack trace; a 500 is a defect or environment problem and always carries `err` with a stack (RB-007).

The environment variable `LOG_LEVEL` sets the minimum level written; the default `info` writes 30 and above. `LOG_LEVEL=warn` would drop the `request completed` and domain event lines and make SLA measurement (OPS-020) and correlation impossible, so it is not permitted on a branch workstation. `LOG_LEVEL=debug` is accepted but version 1.1 writes no debug events. A non-default value is recorded in the shift log (REF-030).

## Message catalog with sample lines

Tredgate Loan writes exactly eight message texts. Any other `msg` value means an unreleased change and is reported to Platform Engineering.

| `msg` | Level | Event fields | When |
|---|---|---|---|
| `Tredgate Loan API started` | 30 | `port`, `dataFile`, `logFile`, `servingFrontend` | Once per process start |
| `Tredgate Loan API failed to start` | 50 | `err`, `port` | Once, when the process cannot open its port (the `err.code` is `EADDRINUSE` when another instance holds it); the process then exits with code 1 (RB-004) |
| `request completed` | 30 | `method`, `url`, `status`, `durationMs` | Once per request, after the response, whatever the status |
| `loan created` | 30 | `loanId`, `amount`, `termMonths` | Successful `POST /api/loans` |
| `loan status updated` | 30 | `loanId`, `status` | Successful manual decision via `PATCH /api/loans/:id/status` |
| `loan auto-decided` | 30 | `loanId`, `status` | Successful `POST /api/loans/:id/auto-decide`; `status` is the outcome |
| `request rejected` | 40 | `status`, `reason` | Any 4xx; `reason` is the text also returned in the JSON `error` field |
| `request failed with an unexpected error` | 50 | `err` | Any 500 |

Sample lines, one per message:

```
{"level":30,"time":"2026-09-28T07:02:11.410Z","pid":10791,"hostname":"branch-ws-07","port":3000,"dataFile":"/opt/tredgate-loan/server/data/loans.json","logFile":"/opt/tredgate-loan/logs/app.log","servingFrontend":true,"msg":"Tredgate Loan API started"}
{"level":30,"time":"2026-09-28T07:02:40.118Z","pid":10791,"hostname":"branch-ws-07","reqId":"3f9c1a72","method":"GET","url":"/api/health","status":200,"durationMs":1,"msg":"request completed"}
{"level":30,"time":"2026-09-27T18:30:35.822Z","pid":10791,"hostname":"branch-ws-07","reqId":"ea7a9d44","loanId":"muk5m5v2e3z5zkt","amount":5000,"termMonths":12,"msg":"loan created"}
{"level":30,"time":"2026-09-28T14:05:12.331Z","pid":10791,"hostname":"branch-ws-07","reqId":"7b1e90c2","loanId":"ln-1006","status":"approved","msg":"loan status updated"}
{"level":30,"time":"2026-09-28T14:07:03.902Z","pid":10791,"hostname":"branch-ws-07","reqId":"c05d21e8","loanId":"ln-1004","status":"approved","msg":"loan auto-decided"}
{"level":40,"time":"2026-09-28T09:12:48.006Z","pid":10791,"hostname":"branch-ws-07","reqId":"18e15ee8","status":400,"reason":"Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)","msg":"request rejected"}
{"level":50,"time":"2026-09-28T08:58:20.447Z","pid":10791,"hostname":"branch-ws-07","reqId":"c41d02aa","err":{"type":"SyntaxError","message":"Unexpected end of JSON input","stack":"SyntaxError: Unexpected end of JSON input\n    at JSON.parse (<anonymous>)\n    at read (/opt/tredgate-loan/server/loanStore.ts:29:17)"},"msg":"request failed with an unexpected error"}
```

The `loan created` line carries `amount` and `termMonths` but deliberately not `applicantName` or `interestRate`; the record is identified by `loanId`.

## Correlating lines with reqId

Each HTTP request receives a fresh `reqId` of 8 hexadecimal characters, such as `ea7a9d44`, when it arrives. Every line written while handling that request carries the same `reqId`, and the last of them is always `request completed`. Lines from different requests interleave, so the `reqId` is the only reliable grouping.

Rule: **an investigation starts from a `reqId`, never from a timestamp alone.** The full reading guide is RB-002; the short form:

1. Copy the `reqId` from the line of interest.
2. Run `grep '"reqId":"c41d02aa"' logs/app.log`. The result is the complete story of that request: at most one domain event line, at most one rejection or failure line, and exactly one `request completed` line with `method`, `url`, and final `status`.
3. To follow one application across requests, switch to `loanId`: `grep '"loanId":"ln-1006"' logs/app.log` returns its `loan created` line and, if decided, its `loan status updated` or `loan auto-decided` line, each with its own `reqId`.

Worked example. The UI banner reads "Action failed: Loan with id ln-1006 has already been decided (approved)". Request `7b1e90c2` shows `loan status updated` with `"status":"approved"` and `request completed` with `"status":200`; seconds later request `9a40d3b1` shows `request rejected` and `request completed` with `"status":409`. Two requests: the first approved, the second was correctly refused. No fault. Incident reports and Known Issue entries quote the `reqId` and `loanId` of such evidence lines.

## What must never be logged

The log travels further than the data file: it is pasted into incident channels, attached to postmortems, and read by engineers with no need to know who applied. Therefore:

| Never logged | Instead |
|---|---|
| `applicantName` or any part of it | `loanId` |
| Any other personal data: addresses, identification numbers, contact details, anything from the KYC Desk | Nothing; Tredgate Loan does not hold it |
| Request bodies or query strings | `method`, `url`, `status` only |
| `interestRate` on the created line | Read it from the record via `GET /api/loans` when needed |

The rule is enforced three ways. Every pull request that adds or changes a log statement is reviewed for these fields (OPS-050). Every message text is fixed in the catalog of this document, so a new message requires a handbook update in the same pull request. And the Compliance Officer runs `grep -c applicantName logs/app.log` on the first business day of each month and expects `0` (OPS-030); any other result is an incident with Compliance informed the same day (POL-070).

The same rule applies to people: incident messages, shift logs, and Known Issue entries identify applications by `loanId`, never by name.

## Retention and rotation on the branch workstation

The server never rotates, truncates, or deletes its log; the file grows until the Operations Lead acts. The branch standard is **12-month retention with manual weekly rotation**; the retention period is set by POL-070 and the rotation is performed every Monday before the process is started (OPS-030):

1. Confirm the process is not running: `curl http://localhost:3000/api/health` is refused.
2. Move the current file to a dated archive in the same folder: `logs/app.log` becomes `logs/app-2026-09-28.log`, using the rotation date.
3. Delete archives dated more than 12 months ago.
4. Start the process with `npm start`; it creates a new `logs/app.log` whose first line is `Tredgate Loan API started`.

Rotation happens only while the process is stopped, because the server holds the file open and would keep writing into a moved file; if the process must run through a Monday, rotate at the next end of day.

Archives stay in the `logs` folder on the workstation, are included in the workstation's encrypted backup, and are never copied to shared network locations or sent by email, because they contain `loanId`s and stack traces with installation paths (POL-070).

Evidence needed for longer than 12 months is copied as text into the postmortem or Known Issue entry within the retention period; after 12 months an application's decision time cannot be recovered from the log, which is why the weekly SLA measurement of OPS-020 is never postponed.

## Daily review and health checks

The Operations Lead reviews the log at start and end of day (OPS-030) with three commands run in the installation folder.

| Check | Command | Expected | If not |
|---|---|---|---|
| Errors | `grep -c '"level":50' logs/app.log` | `0` | Investigate each level 50 line by `reqId` (RB-007); match it to an incident log entry or create one (OPS-040) |
| Warnings | `grep '"level":40' logs/app.log \| tail -n 20` | Routine `reason` values from RB-008, occasional 404 or 409 | A `reason` repeating many times indicates an input source problem (KI-003); report to Platform Engineering |
| Restarts | `grep -c '"msg":"Tredgate Loan API started"' logs/app.log` | `1` per day | More than one means the process restarted; each restart needs an explanation in the shift log |

Health checks are deliberately simple and deliberately limited:

- `GET /api/health` returns `{"status":"ok","uptimeSeconds":<n>}`, where `uptimeSeconds` is the whole number of seconds since the process started. It proves the process is up and accepting HTTP. It does **not** read the data file, so it stays `ok` while every real request fails with 500 because `server/data/loans.json` is corrupted (RB-003).
- `GET /api/loans` is the deep check: it reads and parses the data file. A `200` with an array proves the data path works; a `500` with a level 50 line identifies the problem. The UI performs this check on every load, so the red banner "Failed to load loan applications" is the earliest indicator of a data file problem (RB-005).
- The summary tiles are recorded at start of day, midday, and end of day; a Total Applications value lower than the previous reading is data loss and an incident.

There is no automated alerting in version 1.1; a failure between readings is noticed by a Loan Officer seeing an error in the UI, who reports the time and message immediately (OPS-030).
