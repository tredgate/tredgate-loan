---
id: RB-002
title: Reading the Application Log
section: Runbooks
tags: [logging, app-log, json-lines, reqId, pino, grep, jq, stack-trace, troubleshooting]
updated: 2026-09-27
---

# RB-002 Reading the Application Log

## Symptoms

You need this runbook when the log is the evidence you have to read, typically because:

- A Loan Officer reports that an action "did nothing" or showed "Action failed: Internal server error", and you must find what the server recorded for that request.
- The UI shows "Failed to load loan applications: Internal server error" and RB-005 has sent you to the log to find the level 50 line.
- A Known Issue investigation (RB-007) or a postmortem (OPS-040) needs an exact timeline: which requests ran, in which order, with which results and durations.
- Compliance (POL-070) asks when an application was decided. The log records `loanId`, new `status` and timestamp of every decision, but no applicant name and no user identity (version 1.1 has no authentication).

## When to use this runbook

Use it for any question of the form "what did Tredgate Loan do at time T or for request R": reconstructing a request that returned an error; confirming that a decision was recorded (`loan status updated`, `loan auto-decided`); confirming when the system started and with which data file (`Tredgate Loan API started`); counting rejected requests; extracting the stack trace of a 500 for RB-007.

Do not use the log to look up business data: it contains no personal data (OPS-060, POL-070), and the current state of applications is shown by the UI or `GET /api/loans` (REF-010). Do not edit or truncate the log while the process runs; the logger appends synchronously.

The log is written twice, to the terminal (stdout) and to `logs/app.log` (or the LOG_FILE path), with identical lines. The file is created at process start and grows without rotation in 1.1; OPS-060 defines archiving.

## Prerequisites

- Read access to `logs/app.log`, or to the path shown in the `logFile` field of the startup line when LOG_FILE is overridden.
- A terminal with `grep`, `tail` and `sed` (macOS, Linux) or PowerShell with `Select-String` and `Get-Content` (Windows).
- Optional: `jq`, a command-line JSON processor. It is not part of Tredgate Loan and not required; it only makes lines easier to read. Check with `jq --version`.
- The configured LOG_LEVEL: the default `info` writes level 30 and above; at `warn` only rejections and failures remain, so timelines cannot be reconstructed.
- The approximate time of the event in UTC. Timestamps are ISO 8601 with a `Z` suffix; 10:42 local time in a UTC+2 zone is `08:42` in the log.

## Diagnosis

1. Read one line. Base fields are `level`, `time`, `pid`, `hostname`, `msg` and, for anything tied to a request, `reqId` (8 hexadecimal characters). Levels: `30` info, `40` warn (expected rejections, 4xx), `50` error (unexpected failures, 500). No message is emitted at level 20 (debug), so `LOG_LEVEL=debug` behaves like `info`.

2. Know the eight message types.

   | msg | Level | Extra fields | Emitted when |
   |---|---|---|---|
   | `Tredgate Loan API started` | 30 | port, dataFile, logFile, servingFrontend | process is listening |
   | `Tredgate Loan API failed to start` | 50 | err (code, message, stack), port | the port could not be opened, usually `EADDRINUSE` (RB-004); the process exits with code 1 |
   | `request completed` | 30 | method, url, status, durationMs | every request, once, when the response is finished |
   | `loan created` | 30 | loanId, amount, termMonths | `POST /api/loans` returned 201 |
   | `loan status updated` | 30 | loanId, status | `PATCH /api/loans/:id/status` succeeded |
   | `loan auto-decided` | 30 | loanId, status | `POST /api/loans/:id/auto-decide` succeeded |
   | `request rejected` | 40 | status, reason | any 400, 404 or 409 (RB-008) |
   | `request failed with an unexpected error` | 50 | err (type, message, stack) | any 500 (RB-007) |

   ```json
   {"level":30,"time":"2026-09-27T18:30:35.822Z","pid":10791,"hostname":"branch-ws-07","reqId":"ea7a9d44","loanId":"muk5m5v2e3z5zkt","amount":5000,"termMonths":12,"msg":"loan created"}
   {"level":30,"time":"2026-09-27T18:30:35.822Z","pid":10791,"hostname":"branch-ws-07","reqId":"ea7a9d44","method":"POST","url":"/api/loans","status":201,"durationMs":4,"msg":"request completed"}
   {"level":40,"time":"2026-09-27T18:30:35.824Z","pid":10791,"hostname":"branch-ws-07","reqId":"18e15ee8","status":400,"reason":"Applicant name is required","msg":"request rejected"}
   {"level":50,"time":"2026-09-27T18:33:40.011Z","pid":10791,"hostname":"branch-ws-07","reqId":"23c51241","err":{"type":"SyntaxError","message":"Unexpected end of JSON input","stack":"SyntaxError: Unexpected end of JSON input\n    at JSON.parse (<anonymous>)\n    at Object.read (/opt/tredgate-loan/server/loanStore.ts:29:19)"},"msg":"request failed with an unexpected error"}
   ```

3. Correlate by `reqId`. Each request produces exactly one `request completed` line plus at most one event, rejection or failure line, all with the same `reqId`. The event or error line comes first, the completion line last, usually within the same millisecond, so a `request completed` line with `"status":500` always has a level 50 partner just before it.

4. Read the `err` field of a level 50 line: `err.type` is the error class, `err.message` the message, `err.stack` the trace with frames separated by `\n`. Stop at the first frame under `shared/` or `server/` (not `node_modules`); that file, line and column is where the failure surfaced. In the example it is `server/loanStore.ts:29:19`, the `JSON.parse` of the data file, which means a corrupted file (RB-003).

## Resolution

Copy-and-paste commands for the common tasks. Replace `logs/app.log` with the `logFile` path from the startup line if LOG_FILE is overridden.

Follow the log live while reproducing a problem:

```bash
tail -f logs/app.log
Get-Content logs/app.log -Wait -Tail 20      # Windows PowerShell
```

Find all unexpected failures, and all rejections counted by reason:

```bash
grep '"level":50' logs/app.log
grep -o '"reason":"[^"]*"' logs/app.log | sort | uniq -c | sort -rn
```

Show every line of one request:

```bash
grep '23c51241' logs/app.log
```

Find the last failure and the requests before it: the first command prints the line number of the last level 50 line, the second the ten lines before it and the failing request's own completion line after it:

```bash
grep -n '"level":50' logs/app.log | tail -n 1
grep -n -B 10 -A 1 '"level":50' logs/app.log | tail -n 12
```

Show when the process was (re)started and which data file it used:

```bash
grep 'Tredgate Loan API started' logs/app.log
```

With `jq` installed (optional), print failures with real line breaks in the stack trace, and a request timeline as a table:

```bash
jq -r 'select(.level==50) | "\(.time) \(.reqId)\n\(.err.stack)\n"' logs/app.log
jq -r 'select(.msg=="request completed") | [.time,.reqId,.method,.url,.status,.durationMs] | @tsv' logs/app.log
```

If the last line is not valid JSON (process killed mid-write), `jq` stops with a parse error while `grep` still works.

## Verification

You have read the log correctly when you can state, for the request under investigation:

1. Its `reqId`, and that `grep '<reqId>' logs/app.log` returns two lines (event or error line plus `request completed`) or one line for a plain `GET` that only has a completion line.
2. Its `method`, `url`, `status` and `durationMs` from the `request completed` line.
3. For a 4xx: the exact `reason`, which must be one of the messages in RB-008.
4. For a 500: `err.type`, `err.message` and the first project frame of `err.stack`, ready to paste into a Known Issue entry using the template in `docs/handbook/known-issues/README.md`.
5. The last successful `request completed` line before the failure.

Cross-check the time: convert the UTC timestamp to local time and confirm it matches the officer's report; a difference of exactly one or two hours is a time zone conversion. If the action is missing from the log entirely, the request never reached this API: the browser could not connect (RB-005) or a different instance answered (RB-004).

## Prevention

- Keep LOG_LEVEL at `info`. It is the default and the only level at which the startup line and the `request completed` lines exist; a `warn`-level log cannot reconstruct timelines.
- Never add personal data to the log. The code logs `loanId`, amounts, terms and statuses, never `applicantName`; any logging change is reviewed per OPS-050 against POL-070.
- Archive `logs/app.log` per OPS-060 while the process is stopped (RB-001); the logger keeps the file open and appends synchronously.
- Note the `reqId` when reporting a problem to Platform Engineering. It finds everything the server knows about a request and avoids ambiguity when several officers worked at the same time.
- Write the branch's time zone offset on the workstation's configuration note so timestamps can be converted without guessing.

## Related documents

- OPS-060 Logging and Monitoring Standards: levels, retention and the no-personal-data rule.
- OPS-040 Incident Management: evidence a postmortem needs from the log.
- RB-003 Data File Missing or Corrupted: the `SyntaxError` signature in level 50 lines.
- RB-007 Investigating a 500 Error: the triage procedure that starts from a level 50 line.
- RB-008 Validation Errors (400) Reference: every `reason` of a `request rejected` line.
- RB-001 Starting and Stopping Tredgate Loan: the startup line, LOG_LEVEL and LOG_FILE.
- REF-030 Configuration and Environment: LOG_FILE and LOG_LEVEL reference.
- POL-070 Compliance, KYC and Data Handling: why applicant names never appear in the log.
