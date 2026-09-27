---
id: OPS-040
title: Incident Management
section: Operations
tags: [incident, severity, on-call, triage, postmortem, known-issues, communication]
updated: 2026-09-27
---

# OPS-040 Incident Management

## Purpose and definitions

This document defines how Tredgate Financial Services handles incidents affecting Tredgate Loan at a branch: severity, who responds and how fast, declaration and communication, first triage steps, runbook selection by symptom, and closure with a postmortem and a Known Issue entry.

An **incident** is any unplanned event that prevents or degrades the recording or deciding of Simple Personal Loan applications in Tredgate Loan, or that puts the data file or applicant data at risk. A slow queue caused by staffing is not an incident; a UI stuck on "Failed to load loan applications" is. One `400` caused by a typo is not an incident; the same `400` for every application because an import script sends the amount as a string (KI-003) is.

Three teams take part: Lending Operations (the Operations Lead) detects, declares, and communicates; Platform Engineering provides the on-call engineer who fixes S1 and S2 and advises on S3 and S4; Compliance is informed whenever applicant data may have been exposed, lost, or altered, and receives every postmortem.

Because Tredgate Loan is a single-instance system on one workstation with no database, most incidents come down to three things: the process is not running, the data file `server/data/loans.json` is unreadable, or requests are producing `4xx` or `500` responses.

## Severity levels, response and update times

The Operations Lead assigns severity at declaration; the on-call engineer may raise or lower it with the Operations Lead's agreement. When in doubt, declare the higher severity.

| Severity | Definition | Respond within | Status updates | Handled by | Postmortem |
|---|---|---|---|---|---|
| S1 | System down at a branch during business hours: no applications can be created or decided (process down, every request fails with 500, UI cannot load) | 15 minutes | Every 30 minutes until resolved | Platform Engineer on-call | Required |
| S2 | Degraded or partial: some actions fail, intermittent errors, one branch function unavailable (for example auto-decide fails but manual decisions work), or data integrity in doubt | 1 hour | Every 2 hours until resolved | Platform Engineer on-call | Required |
| S3 | Minor, a workaround exists: a recurring `400` for valid-looking input, a misleading message, an SLA backlog above 15 pending | 1 business day | Daily until resolved | Operations Lead, Platform Engineer consulted | Optional; Known Issue entry if recurring |
| S4 | Cosmetic: layout, wording, formatting of tiles or table | Next release | On release | Platform Engineering (OPS-050) | No |

"Respond" means a named engineer has acknowledged the incident and started triage, not that it is fixed. A failure found before opening time becomes S1 only if it is still present at opening, when the 15-minute clock starts.

Examples:

- `curl http://localhost:3000/api/health` refuses the connection at 09:05 on a business day: S1.
- Approve works, but `POST /api/loans/:id/auto-decide` returns 500 for every pending row: S2.
- Officers repeatedly hit `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)`: S3, coaching (POL-030), not a system fault.

## On-call and how to declare an incident

Platform Engineering keeps one on-call engineer reachable during branch business hours, Monday to Friday; every Operations Lead holds the contact procedure. Only the Operations Lead (or the named shift lead) contacts the on-call engineer; Loan Officers report to the Operations Lead.

Declaration procedure:

1. **Detect.** A Loan Officer reports the time and the exact message in the red banner or terminal to the Operations Lead.
2. **Confirm.** The Operations Lead reproduces it once (reload the UI or run the health check); the confirmation time is the incident start time.
3. **Classify.** Assign S1 to S4 using the severity table.
4. **Declare.** For S1 and S2, contact the on-call engineer immediately with the "Declared" template and open an incident log entry numbered `INC-<YYYYMMDD>-<nn>`. For S3, open the entry and notify the on-call engineer by end of day. For S4, raise a change request under OPS-050.
5. **Protect the data.** If the data file may be involved (500 responses, `SyntaxError` in the log, a lower Total Applications tile), copy `server/data/loans.json` and `logs/app.log` to the backup folder with the incident number in the file name before anything else. Never run `npm run data:reset` during an incident without the on-call engineer's explicit instruction and a fresh copy of the current file (RB-006).
6. **Inform Compliance** the same day if applicant data may have been lost, altered, exposed, or logged (POL-070), and **communicate** with the templates at the update intervals of the severity table.

The incident is resolved when the on-call engineer and the Operations Lead agree the branch can work normally, and closed when the postmortem and Known Issue entry (S1 and S2) are filed.

## Communication templates

Send on the branch operations channel, and by phone for S1. Never include applicant names or other personal data; identify applications by `loanId` only.

**Declared**

```
INCIDENT DECLARED  INC-20260928-01  Severity: S1
Branch: <branch code>   Declared by: Operations Lead   Start: 09:05 local
Impact: Tredgate Loan UI shows "Failed to load loan applications"; no applications can be created or decided.
Evidence: GET /api/health -> connection refused. Last log line 08:58 "request completed".
Actions so far: data file and log copied to backup folder as INC-20260928-01-*.
Workaround: applications taken on paper, to be entered after recovery.
Next update: 09:35
```

**Update**

```
INCIDENT UPDATE  INC-20260928-01  Severity: S1  Update #2  09:35 local
Status: investigating / fix identified / fix applied, verifying
Findings: <e.g. "process exited at 08:59; port 3000 held by another process, RB-004">
Next step: <what and who>
Next update: 10:05
```

**Resolved**

```
INCIDENT RESOLVED  INC-20260928-01  Severity: S1  Resolved: 09:41 local  Duration: 36 min
Cause (preliminary): <one sentence>
Fix: <one sentence, runbook reference>
Data check: Total Applications tile = <n>, equals last shift log value.
Follow-up: postmortem by <date>, Known Issue entry KI-<nnn>. Paper applications to enter: <count>
```

An update with nothing new ("still investigating, next update 10:05") is still sent; a missed update is reported by the Operations Lead to the Platform Engineering lead.

## Triage: the first ten minutes

The on-call engineer, or the Operations Lead while waiting, runs these steps in order and records each result in the incident log.

1. **Is the process up?** `curl http://localhost:3000/api/health`. Expected `{"status":"ok","uptimeSeconds":<n>}`. Connection refused: the process is not running; check the terminal for the exit reason, then RB-001 (RB-004 if the restart fails with an address-in-use error). A low `uptimeSeconds` on a process that should have run all day means it restarted; the `Tredgate Loan API started` line in the log gives the time.
2. **What does the log say?** `tail -n 50 logs/app.log`. Level 50 lines (`"msg":"request failed with an unexpected error"`) carry `err.message` and `err.stack`; the same `reqId` leads to the `request completed` line with the failing `url`. Level 40 lines with a repeating `reason` point to an input problem (RB-008). Reading guide: RB-002; 500 investigation: RB-007.
3. **Is the data file readable?** `node -e "JSON.parse(require('fs').readFileSync('server/data/loans.json','utf8')); console.log('data file OK')"`. A `SyntaxError` means the file is corrupted; a missing-file error means it was deleted, and the next request would recreate it from the seed and lose all live data, so follow RB-003 first. A healthy `GET /api/health` with a failing `GET /api/loans` is the classic data file signature, because the health endpoint never reads the file.
4. **Did anything change?** Compare `dataFile`, `logFile`, and `port` in the latest `Tredgate Loan API started` line with the defaults in REF-030. A release today (OPS-050) or a non-default environment variable is the first suspect.

Do not restart before step 3 is complete, and never delete or reset the data file before it has been copied under the incident number.

## Runbook selection by symptom

| Symptom | Likely cause | Open |
|---|---|---|
| Health check refused, terminal shows the process exited | Process stopped or crashed | RB-001 Starting and Stopping Tredgate Loan |
| `npm start` fails with an address-in-use error on port 3000 | Another process holds the port | RB-004 Port Already in Use |
| UI red banner "Failed to load loan applications" | API unreachable or `GET /api/loans` failing | RB-005 Frontend Shows "Failed to load loan applications" |
| Every request returns 500; log shows `SyntaxError` on JSON parse | Data file corrupted or truncated | RB-003 Data File Missing or Corrupted (background: KI-001) |
| Total Applications tile dropped to 6 and shows only `ln-1001` to `ln-1006` | Data file missing and recreated from seed, or reset run | RB-003, then RB-006 Resetting and Seeding Data |
| One route returns 500, others work | Code defect | RB-007 Investigating a 500 Error |
| Repeated `400` with the same `reason` for valid-looking input | Input format problem (string amount, rate as percentage) | RB-008 Validation Errors (400) Reference; KI-002, KI-003 |
| `409` "has already been decided" | Not a fault: decisions are final | OPS-020; no runbook |

## Postmortem and Known Issue entry

Every S1 and S2 incident ends with a postmortem within 5 business days of resolution, written by the on-call engineer, reviewed by the Operations Lead, and sent to Compliance. S3 incidents get one when they recur. Postmortems are blameless: they name roles and actions, never individuals.

Postmortem template:

```
Postmortem INC-<YYYYMMDD>-<nn>          Severity: S_   Branch: ___
1. Summary            One paragraph: what the branch experienced and for how long.
2. Timeline           Local times: detected, declared, on-call responded, cause found, fix applied, resolved, verified.
3. Impact             Downtime minutes in business hours; applications delayed (loanIds); data lost or restored; SLA breaches (OPS-020).
4. Log signature      The exact msg, level and err.message lines that identify this failure, with reqId.
5. Root cause         The underlying reason, not the symptom.
6. Fix                What restored service (runbook used) and what corrects the cause permanently (pull request, OPS-050).
7. Prevention         Checklist, runbook or validation changes; owner and due date for each.
8. Known Issue        KI number filed.
```

Rule: **every S1 and S2 incident results in a Known Issue entry**, created from the template in `known-issues/README.md`, whether or not the cause is a software defect. The entry records symptom, log signature, root cause, fix, and prevention, so that the next Operations Lead who sees the same log signature finds the answer by searching the handbook. The entry is filed by pull request together with any runbook change (OPS-050); the incident is closed when that pull request is merged.
