---
id: POL-070
title: Compliance, KYC and Data Handling
section: Policy
tags: [compliance, kyc, aml, personal-data, retention, logging, backups, audit]
updated: 2026-09-15
---

# POL-070 Compliance, KYC and Data Handling

## Purpose and scope

This document sets the compliance rules that apply to the Simple Personal Loan (SPL) process and to the Tredgate Loan system that records it: who is responsible for know-your-customer (KYC) and anti-money-laundering (AML) checks, which personal data Tredgate Loan holds and where, how long data is kept, what may and may not be written to the application log, who may access the branch workstation, how the data file is backed up, and how audit questions are answered from the log.

Tredgate Loan has a small footprint: one JSON data file, one log file, and an API without authentication, on a branch workstation. That makes the rules simple but dependent on people. Compliance owns this document and audits against it; Lending Operations and Platform Engineering apply it. Related material: POL-020 and REF-020 (fields), OPS-060 (logging standard), RB-002 (reading the log), RB-006 (data reset).

## KYC and AML responsibilities

KYC Desk is the single owner of identity verification, eligibility evidence, and AML screening. Tredgate Loan holds none of that evidence and has no field for a KYC reference, so the link between an application and its KYC file is the applicant's name plus the clearance reference written in the Decision Register (POL-050).

| Responsibility | Owner | Where recorded |
|---|---|---|
| Verify identity from government photo identification | KYC Desk | KYC Desk verification record |
| Verify age (18 or older) and residency | KYC Desk | KYC Desk |
| Collect and verify income evidence | KYC Desk | KYC Desk; the income figure is never entered in Tredgate Loan |
| Sanctions and politically exposed person screening | KYC Desk | KYC Desk screening result |
| Confirm KYC clearance exists before creating an application | Loan Officer | Decision Register entry or branch application checklist |
| Report suspicious activity | Any officer, via the Compliance Officer | Compliance suspicious activity log, never in Tredgate Loan |

No application is created in Tredgate Loan until KYC Desk has issued a clearance for the applicant within the last 12 months. Because the system cannot check this, Compliance samples 20 decided applications per branch per month and traces each `loanId` to a clearance; a missing clearance is a reportable breach, whatever the decision was.

Officers never record suspicions, screening results, or KYC notes in Tredgate Loan; the name field holds the verified legal name and nothing else (POL-020).

## Personal data stored in Tredgate Loan

Tredgate Loan stores one item of personal data: the applicant's name. Every other field on an application is financial or technical.

| Field | Personal data? | Notes |
|---|---|---|
| `id` | No | System-generated identifier, for example `muk5m5v2e3z5zkt`; seed records use `ln-1001` to `ln-1006` |
| `applicantName` | **Yes** | Verified legal name, trimmed of surrounding spaces |
| `amount` | No | Requested principal in USD |
| `termMonths` | No | Term in months |
| `interestRate` | No | Annual rate as a fraction |
| `status` | No | `pending`, `approved`, or `rejected` |
| `createdAt` | No | ISO 8601 timestamp in UTC |

The name is stored in the data file, by default `server/data/loans.json` (configurable with `DATA_FILE`, REF-030), a pretty-printed JSON array that the application does not encrypt. The name is also returned by `GET /api/loans` and displayed in the application list, so anyone who can reach port 3000 can read every applicant name on the workstation.

No address, date of birth, identification number, income, or contact detail is stored, and none may be added through the name field. Protecting the data file and the network port therefore protects all personal data the system holds.

## Data retention

Tredgate Loan is a short-lived working record; Tredgate Core Banking is the long-term record.

| Data | Retention | Where | Disposal |
|---|---|---|---|
| Approved and rejected applications, with applicant names | 7 years from the decision | Tredgate Core Banking (approved) and the branch correspondence file and Decision Register (all decisions) | Core Banking archival policy |
| Branch data file `loans.json` | 90 days rolling | Tredgate Loan on the branch workstation | Reset with `npm run data:reset`, which replaces the file with the seed records (RB-006) |
| Backups of the data file | 90 days | Branch backup share | Deleted by the backup schedule |
| Application log `logs/app.log` | 12 months | Branch workstation; rotation under OPS-060 | Deleted after 12 months; contains no personal data |

The 90-day reset procedure, run by the Operations Lead at the end of each quarter:

1. Confirm there are no pending applications older than 2 business days (OPS-020); decide any that remain.
2. Confirm in the Decision Register that every approved application in the file has a Core Banking account number and every rejected application has a filed letter (POL-060).
3. Produce and file the monthly report for the period (POL-060), because the figures cannot be recomputed after the reset.
4. Take a final backup of `loans.json` and store it on the branch backup share.
5. Run the reset following RB-006. The file now contains only the six seed reference records `ln-1001` to `ln-1006`.
6. Record the reset date in the Decision Register.

Applications are never deleted individually: the API has no delete operation and hand-editing is prohibited, so retention is all-or-nothing at the file level, which is why the pre-reset checks matter.

## Logging rule: applicant names are never logged

The application log contains no personal data by design, so it can be read, copied, and shared with Platform Engineering during an incident without a data handling review. The rule is: **log the `loanId`, never the applicant name.** The system's own log statements comply, and the rule binds anyone who adds a log statement in a future release (OPS-050, OPS-060).

| Log message | Level | Fields written | Personal data |
|---|---|---|---|
| `Tredgate Loan API started` | info | `port`, `dataFile`, `logFile`, `servingFrontend` | None |
| `request completed` | info | `method`, `url`, `status`, `durationMs` | None; URLs contain only identifiers such as `/api/loans/ln-1004/status` |
| `loan created` | info | `loanId`, `amount`, `termMonths` | None; the name is deliberately omitted |
| `loan status updated` | info | `loanId`, `status` | None |
| `loan auto-decided` | info | `loanId`, `status` | None |
| `request rejected` | warn | `status`, `reason` | None; the reason is one of the fixed validation or error messages, which quote identifiers but never names |
| `request failed with an unexpected error` | error | `err` with stack trace | None in normal operation |

Every line also carries `level`, `time`, `pid`, `hostname`, and a per-request `reqId` of 8 hexadecimal characters. A typical creation line reads:

```
{"level":30,"time":"2026-09-27T18:30:35.822Z","pid":10791,"hostname":"branch-ws-07","reqId":"ea7a9d44","loanId":"muk5m5v2e3z5zkt","amount":5000,"termMonths":12,"msg":"loan created"}
```

Three consequences follow. An auditor who needs a name joins `loanId` to the data file, a backup, or the Decision Register; the log alone never identifies a person. Scripts must never place names in API paths; by design only identifiers appear there. And changing `LOG_LEVEL` (REF-030) changes which severities are written, not which fields; there is no level at which names appear.

## Access to the branch workstation

Tredgate Loan version 1.1 has no authentication, so access control is exercised at the workstation and network level.

| Control | Requirement |
|---|---|
| Workstation login | Individual branch credentials for every officer; no shared accounts; screen lock after 5 minutes |
| Network exposure | Port 3000 reachable only from the branch office network; never from the internet or from other branches |
| Production mode | The workstation runs `npm start`, which serves the user interface and API from port 3000 in one process; development mode (`npm run dev`, port 5173) is not used on production workstations |
| File access | `server/data/loans.json` and `logs/app.log` are readable only by the account that runs Tredgate Loan (the Operations Lead account) and by the Platform Engineering on-call account |
| Change access | Only Platform Engineering installs releases (OPS-050); officers never edit code, configuration, or data files |
| Scripts | Import or reporting scripts that call the API run only from the workstation itself under the Operations Lead account |

Because the log records the `hostname` and time of every request but not the person, the workstation login record is the evidence of who was present; the daily reconciliation (OPS-030) compares decision times with the Decision Register and, when needed, with the login record. A decision at a time when no officer was logged in is a security incident, reported to Compliance and Platform Engineering the same day (OPS-040).

## Backups of the data file

The data file is the only copy of applications not yet handed over, so it is backed up daily. Backups contain applicant names and are handled as personal data.

1. At close of business, the Operations Lead copies `server/data/loans.json` to the encrypted branch backup share under a folder named for the date, for example `tredgate-loan/2026-09-26/loans.json`.
2. Never copy `loans.json.tmp`. It is the temporary file that the system writes before atomically renaming it over `loans.json`; if it exists at all, it is incomplete.
3. Verify the copy is valid JSON before relying on it, for example with `node -e "JSON.parse(require('fs').readFileSync('loans.json','utf8'))"`.
4. Keep backups for 90 days, matching the retention of the data file, then delete them.
5. To restore, follow RB-003: stop Tredgate Loan (RB-001), copy the backup over `loans.json`, start the system, and confirm with `GET /api/loans` that the expected records are present.

Two system behaviors matter here. If `loans.json` is missing when first read, the system recreates it from the seed file `server/data/loans.seed.json`, so a missing file silently becomes six reference records rather than an error, and a restore is needed to recover branch data. If the file is present but corrupted (invalid JSON), every request fails with HTTP 500 and the log shows a `SyntaxError` (RB-003). The only permitted writes are by the system, by a restore from backup, and by `npm run data:reset`.

## Answering audit questions from the log

Auditors ask a small set of recurring questions. Most are answered from the log, correlated by `loanId` and `reqId`, with the Decision Register supplying the human element the system does not record (RB-002 explains how to read the log file).

| Question | Where the answer is | How to find it |
|---|---|---|
| When was application X created? | Log line `loan created` with `"loanId":"X"`; also `createdAt` in the data file | `grep '"loanId":"X"' logs/app.log` and read `time` on the `loan created` line |
| Was X decided manually or automatically? | `loan status updated` (manual) or `loan auto-decided` (automatic) | Same search; exactly one of the two lines exists for a decided application |
| When was X decided, and how long did it take? | `time` on the decision line minus `createdAt` | Compare with the 2-business-day service level (OPS-020) |
| Who decided X? | Not in the log or the data file | Decision Register entry for X (approvals) or the filed letter (rejections); the log gives `hostname` and time to corroborate |
| Did anyone try to change a decided application? | `request rejected` warning with `status` 409 and a `reason` naming X | `grep '"status":409' logs/app.log` |
| Which invalid applications were submitted? | `request rejected` warnings with `status` 400 and the validation message | The reason never contains a name; the attempted data is not logged |
| Which HTTP request produced a decision? | `request completed` line with the same `reqId` as the decision line | Gives `method`, `url`, `status`, and `durationMs` |

A worked example: an auditor asks whether `ln-1004` (100,000 USD over 60 months) was approved with the right authority. The log shows `loan auto-decided` with `"status":"approved"`, so no signature was required: the application is inside the standard risk envelope (POL-040). Had the line been `loan status updated`, the auditor would expect a Decision Register entry with a Senior Loan Officer signature, because 100,000 USD is in the 50,000.01 to 100,000 tier (POL-050).

Log files must never be edited or truncated; a decision line without a matching `request completed` line is itself a finding. Data incidents (a lost or exposed backup, a data file read by an unauthorized person, names found in a log) are reported to the Compliance Officer within 1 business day and handled as an S2 incident (OPS-040).
