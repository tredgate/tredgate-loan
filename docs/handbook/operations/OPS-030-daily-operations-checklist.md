---
id: OPS-030
title: Daily Operations Checklist
section: Operations
tags: [checklist, start-of-day, end-of-day, backup, health, log-review, weekly, monthly]
updated: 2026-09-27
---

# OPS-030 Daily Operations Checklist

## Purpose and who runs the checklist

This checklist tells the Operations Lead of a branch exactly what to do with Tredgate Loan at the start of the day, during the day, at the end of the day, and on a weekly and monthly cycle. It exists because Tredgate Loan is a single-instance system on one branch workstation with one data file (`server/data/loans.json`) and one log file (`logs/app.log`), and nothing else backs them up, monitors them, or rotates them. The routine in this document is the monitoring.

The Operations Lead runs every step that involves a terminal. A Senior Loan Officer may stand in when the Operations Lead is absent and is then named as shift lead in the shift log. Loan Officers perform only the "during the day" queue work in the UI. The on-call Platform Engineer is consulted, never required, for the daily routine; if a step fails and the referenced runbook does not resolve it, the Operations Lead declares an incident under OPS-040.

Branch standard: the process is stopped at end of day and started at start of day. This keeps the log rotation of OPS-060 simple and means every day begins with a verified clean start. Stopping with Ctrl+C is safe at any moment since version 1.1.0, because writes go to a temporary file first and are renamed into place (changelog, KI-001).

All commands are run from the Tredgate Loan installation folder on the workstation.

## Start of day

Complete the following before the first applicant is served. Expected duration: 10 minutes.

1. **Rotate the log if it is Monday.** Move `logs/app.log` to `logs/app-<YYYY-MM-DD>.log` and delete archives older than 30 days (procedure in OPS-060). Do this before starting the process; the server creates a fresh `logs/app.log` on start.
2. **Start the system.** Run `npm start`. It builds the web UI and then serves the UI and the API from port 3000 in one process. Use `npm run dev` only when Platform Engineering asks for it; it starts the UI on port 5173 and the API on port 3000 as two processes and is meant for development. Details and failure modes: RB-001, RB-004.
3. **Confirm the start line.** The terminal (and `logs/app.log`) shows one line with `"msg":"Tredgate Loan API started"`, `"port":3000`, the `dataFile` and `logFile` paths, and `"servingFrontend":true`. If `servingFrontend` is `false` after `npm start`, the build failed; see RB-001.
4. **Check the health endpoint.** Run `curl http://localhost:3000/api/health`. Expected: `{"status":"ok","uptimeSeconds":<small number>}`. Any other response, or a connection refused, means the process did not start; see RB-001 and RB-004.
5. **Check the data path.** Open `http://localhost:3000` in the browser. The five summary tiles (Total Applications, Pending, Approved, Rejected, Total Approved) and the application table must load without the red error banner. The banner text "Failed to load loan applications" means the API could not read the data file; see RB-005 and RB-003. Note that the health endpoint alone does not prove this, because it never touches the data file.
6. **Review yesterday's log for errors.** Run `grep -c '"level":50' logs/app.log` (or the rotated archive from the previous day). Any count above 0 that is not already in the incident log is investigated with RB-002 and RB-007 before the day begins. Then run `grep '"level":40' logs/app.log | tail -n 20` and scan the `reason` values for anything other than routine validation messages (RB-008).
7. **Compare the queue with the shift log.** The Pending tile must equal yesterday's end-of-day value. A difference means the system was used after close; find the `loan created` or `loan status updated` lines by `time` and record the explanation.

Record completion time and any anomaly in the shift log.

## During the day

The pending queue is worked continuously; the summary tiles are the branch's dashboard.

| Tile | What it counts | How to use it |
|---|---|---|
| Total Applications | All records in the data file | Sanity check: must never decrease during the day. A drop means the data file was replaced (RB-006) and is an incident. |
| Pending | Records with status `pending` | The backlog. Thresholds and actions in OPS-020: up to 5 normal, 6 to 15 assign explicitly, above 15 or any item older than 2 business days is an S3 incident. |
| Approved | Records with status `approved` | Each approval must have a matching disbursement booking in Tredgate Core Banking by end of day (OPS-020). |
| Rejected | Records with status `rejected` | Each rejection must have a letter within 1 business day (OPS-020). |
| Total Approved | Sum of `amount` over approved records, whole dollars | Rough exposure indicator; a jump of 100,000 USD or more in one day prompts a Senior Loan Officer check of the Decision Register. |

Rules for the queue:

- Work oldest first, using the Created column. Auto-decide applications inside the standard risk envelope (amount up to 100,000 USD and term up to 60 months) at creation when no manual review is needed (POL-040).
- Respect approval authority (POL-050): the system does not check who clicks. Above 50,000 USD a Senior Loan Officer decides; above 100,000 USD the Credit Risk Analyst sign-off is in the Decision Register before the check mark is clicked.
- Enter interest rates as fractions: 0.08, not 8. The system rejects anything above 1 with `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)` (RB-008, KI-002).
- When the red banner says "Action failed: Loan with id ... has already been decided", the row was decided by someone else moments ago; press Retry to refresh, and do not report it as a fault.
- When the banner says "Failed to load loan applications", stop entering data, take note of the time, and follow RB-005. If it persists more than 5 minutes during business hours, declare an S1 (OPS-040).

The Operations Lead reads the Pending tile at 12:00 and records it in the shift log.

## End of day

Complete after the last applicant and before leaving. Expected duration: 10 minutes.

1. **Record the tiles.** Write the five tile values into the shift log. The Pending value is compared with tomorrow's start-of-day check.
2. **Review warn and error lines.** Run `grep -E '"level":(40|50)' logs/app.log`. For each level 50 line, the `reqId` leads to the request that failed (RB-002, RB-007); every level 50 line must either be in the incident log or get an entry now. For level 40 lines, confirm the `reason` values are expected validation or 404/409 outcomes; an unusual pattern (for example twenty `Amount must be a number greater than 0` rejections in a row) is noted for Platform Engineering.
3. **Back up the data file.** Copy `server/data/loans.json` to the branch backup folder with the date in the name, for example `loans-2026-09-28.json`, and verify the copy is valid JSON by counting records: `node -e "console.log(JSON.parse(require('fs').readFileSync('server/data/loans.json','utf8')).length)"` must print the Total Applications tile value. Keep 30 daily copies; the backup folder is on the workstation's encrypted backup drive, never on a shared network location (POL-070).
4. **Write the incident log entry.** Anything that interrupted work, every restart, every level 50 line, and every deviation from default configuration is noted with time, `reqId` where relevant, and outcome, even if resolved. This is the raw material for Known Issue entries and the weekly review.
5. **Stop the process.** Press Ctrl+C in the terminal running `npm start` (RB-001). Confirm with `curl http://localhost:3000/api/health` that the connection is refused.
6. **Lock the workstation.**

## Weekly and monthly tasks

**Weekly (Monday, after start of day)**

| Task | Owner | Reference |
|---|---|---|
| Rotate `logs/app.log`, delete archives older than 30 days | Operations Lead | OPS-060 |
| Measure the 2 business day SLA for last week's decisions from `createdAt` and the decision log lines | Operations Lead | OPS-020 |
| Review Decision Register entries against approvals above 50,000 USD | Senior Loan Officer | POL-050 |
| Verify the newest backup restores: validate it as JSON and confirm the record count matches the Total Applications tile from that day's shift log | Operations Lead | RB-003 |
| Delete daily backups older than 90 days | Operations Lead | POL-070 |
| Review open S3 and S4 items and the incident log with the on-call engineer | Operations Lead, Platform Engineer | OPS-040 |

**Monthly (first business day)**

| Task | Owner | Reference |
|---|---|---|
| Confirm `node --version` reports 22.19 or newer and note it in the shift log | Operations Lead | REF-030, changelog |
| Reconcile approved applications with the Decision Register and Tredgate Core Banking bookings | Compliance Officer | POL-070 |
| Confirm no applicant names or other personal data appear in the log: `grep -c applicantName logs/app.log` must print 0 | Compliance Officer | OPS-060 |
| Review the Known Issues register for anything relevant to the branch | Operations Lead | known-issues/README.md |
| Check for a scheduled release and agree the release window | Operations Lead, Platform Engineer | OPS-050 |
| Confirm disk space on the workstation is sufficient for 30 days of logs and backups | Operations Lead | OPS-060 |

## Printable checklist

Print one copy per day; file completed sheets for 12 months.

| Time | # | Step | Done | Note |
|---|---|---|---|---|
| Start | 1 | Monday only: rotate `logs/app.log`, delete archives over 12 months | [ ] | |
| Start | 2 | `npm start` | [ ] | |
| Start | 3 | Start line shows `Tredgate Loan API started`, `servingFrontend: true` | [ ] | |
| Start | 4 | `curl http://localhost:3000/api/health` returns `status: ok` | [ ] | uptimeSeconds: |
| Start | 5 | UI loads tiles and table, no red banner | [ ] | |
| Start | 6 | Previous day: level 50 count = 0 or explained; level 40 reviewed | [ ] | count: |
| Start | 7 | Pending tile equals yesterday's end-of-day value | [ ] | |
| 12:00 | 8 | Pending tile recorded; queue assigned if above 5 | [ ] | pending: |
| End | 9 | Five tile values recorded | [ ] | T: P: A: R: $ |
| End | 10 | Level 40/50 lines reviewed; incident log updated | [ ] | |
| End | 11 | Data file backed up as `loans-<date>.json`; record count verified | [ ] | count: |
| End | 12 | Process stopped (Ctrl+C); health check refused | [ ] | |
| End | 13 | Workstation locked | [ ] | |
| Weekly | W | Rotation, SLA measurement, Decision Register review, backup restore test, backup cleanup, incident review | [ ] | |
| Monthly | M | Node.js version, Compliance reconciliation, personal-data grep, Known Issues, release window, disk space | [ ] | |

Signature of the Operations Lead (or shift lead): ____________________ Date: ____________
