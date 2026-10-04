---
id: OPS-010
title: Roles and Responsibilities
section: Operations
tags: [roles, raci, escalation, handover, branch-workstation, four-eyes]
updated: 2026-09-27
---

# OPS-010 Roles and Responsibilities

## Purpose and scope

This document defines who does what around Tredgate Loan, the system Tredgate Financial Services uses at its branch offices to record Simple Personal Loan (SPL) applications and their decisions. It names the six roles, assigns each key activity to a role in a RACI table, states who owns the branch workstation, and sets the escalation and shift-handover procedures. It applies to every branch that runs Tredgate Loan 1.1.

One fact shapes everything in this document: Tredgate Loan 1.1 has no user authentication. Anyone with access to the branch workstation can create, approve, reject, or auto-decide an application, and the system does not record who clicked the button. Approval limits (policy POL-050), the four-eyes rule for large amounts, and the separation between roles are therefore enforced procedurally, through workstation access, the Decision Register, and the checks in this document, not by the software. Every role holder must understand that these controls are theirs to keep.

Four teams are involved. Lending Operations executes policy and runs the system day to day. Credit Risk owns the lending policy and the rate bands. Platform Engineering owns the Tredgate Loan software and provides on-call cover. Compliance owns data handling and audits the decision trail. The six roles below are drawn from these four teams.

## The six roles and their core duties

| Role | Team | Core duties in Tredgate Loan |
|---|---|---|
| Loan Officer | Lending Operations | Creates applications in the UI after the KYC Desk has confirmed identity. Decides applications up to 50,000 USD alone. May reject any application. May use auto-decide for applications inside the standard risk envelope (amount up to 100,000 USD and term up to 60 months). Works the pending queue within the 2 business day SLA of OPS-020. |
| Senior Loan Officer | Lending Operations | Everything a Loan Officer does, plus approval of applications from 50,000.01 to 100,000 USD and co-signature above 100,000 USD together with a Credit Risk Analyst. First escalation point for Loan Officers. Reviews Decision Register entries weekly. |
| Credit Risk Analyst | Credit Risk | Owns POL-010 to POL-060, the five rate bands, and the values of the standard risk envelope. Records the sign-off for approvals above 100,000 USD in the Decision Register. Must be consulted before any change to the shared business rules in `shared/loanRules.ts`. |
| Operations Lead | Lending Operations | Owns the branch workstation. Runs the start-of-day and end-of-day procedures of OPS-030, keeps the shift log and the incident log, approves a data reset, declares incidents together with the on-call engineer (OPS-040), and schedules releases (OPS-050). |
| Platform Engineer (on-call) | Platform Engineering | Responds to S1 and S2 incidents, executes runbooks RB-001 to RB-008, performs releases and rollbacks, writes postmortems, and files Known Issue entries. |
| Compliance Officer | Compliance | Owns POL-070. Verifies that no personal data reaches the log (OPS-060), approves retention and backup handling, is informed of every incident that touches applicant data, and reconciles the Decision Register against approved applications each month. |

The role names are used consistently across the handbook. Where a runbook says "the operator", it means the Operations Lead or the on-call Platform Engineer, never a Loan Officer.

## RACI for key activities

R = Responsible (does the work), A = Accountable (single owner, signs off), C = Consulted before the activity, I = Informed after it. Each row has exactly one A.

| Activity | Loan Officer | Senior Loan Officer | Credit Risk Analyst | Operations Lead | Platform Engineer (on-call) | Compliance Officer |
|---|---|---|---|---|---|---|
| Create an application (UI form or `POST /api/loans`) | R | A | - | I | - | I |
| Manual decision up to 50,000 USD | R | A | - | I | - | I |
| Manual decision 50,000.01 to 100,000 USD | C | R/A | - | I | - | I |
| Manual approval above 100,000 USD | - | R/A | C (sign-off in Decision Register) | I | - | I |
| Auto-decide (lightning-bolt button or `POST /api/loans/:id/auto-decide`) | R | A | I | I | - | - |
| Reset the data file (`npm run data:reset`) | I | I | - | A | R | I |
| Release a new version (OPS-050) | I | I | C (if `shared/loanRules.ts` changes) | A | R | C (if logging or data handling changes) |
| Incident S1/S2 (OPS-040) | I | I | - | A | R | I |
| Incident S3/S4 (OPS-040) | I | I | - | R/A | C | - |
| Daily log review and data file backup (OPS-030) | - | - | - | R/A | C | I |

Two rows deserve emphasis. A data reset replaces the live `server/data/loans.json` with the six seed records and destroys every application entered since; it is never a Loan Officer action and always needs the Operations Lead's explicit approval and a backup first (RB-006). A release is executed by Platform Engineering but owned by the Operations Lead, because the branch, not the engineering team, carries the consequence of a bad release during business hours.

## Branch workstation ownership

Tredgate Loan is a single-instance application. Each branch runs exactly one copy on one branch workstation, and that workstation holds the only copy of the data file and the log file. Ownership is split as follows.

| Concern | Owner | Notes |
|---|---|---|
| Hardware, operating system, Node.js 22.19 or newer | Operations Lead | Version checked monthly; upgrade coordinated with Platform Engineering |
| Starting and stopping the process (`npm start`, `npm run dev`) | Operations Lead | Procedure in RB-001; Loan Officers do not open a terminal |
| Data file `server/data/loans.json` and its daily backup | Operations Lead | Backup at end of day per OPS-030; restore per RB-003 |
| Log file `logs/app.log`, rotation and 30-day retention | Operations Lead | Standards in OPS-060; Compliance Officer may audit |
| Source code, dependencies, releases, rollbacks | Platform Engineering | Only through pull requests and the release checklist of OPS-050 |
| Environment variables `PORT`, `DATA_FILE`, `LOG_FILE`, `LOG_LEVEL` | Platform Engineering, applied by the Operations Lead | Defaults documented in REF-030; any deviation is written in the shift log |

Because there is no login, workstation access is the access control. The workstation is locked when unattended, only Lending Operations staff on shift sit at it, and terminal commands are limited to the Operations Lead and the on-call engineer. A Loan Officer who needs the system restarted asks the Operations Lead rather than running `npm start` personally.

## Escalation paths

Escalation follows the shortest path that reaches someone with the authority to act. Loan Officers never contact the on-call engineer directly; the Operations Lead does, so that one person at the branch has the full picture.

| Situation | First contact | Escalate to | Authority reference |
|---|---|---|---|
| Application between 50,000.01 and 100,000 USD needs approval | Senior Loan Officer | - | POL-050 |
| Application above 100,000 USD needs approval | Senior Loan Officer | Credit Risk Analyst (sign-off in Decision Register) | POL-050 |
| Application outside the product range (below 1,000 USD, above 250,000 USD, term under 6 or over 84 months) | Loan Officer rejects manually | Senior Loan Officer if the applicant disputes | POL-020 |
| UI shows "Failed to load loan applications" or any request fails | Operations Lead | Platform Engineer on-call (S1 during business hours) | OPS-040, RB-005 |
| Same 400 message appears repeatedly for valid-looking input | Operations Lead | Platform Engineer on-call (S3) | RB-008 |
| Suspected personal data in the log or in a backup outside the workstation | Operations Lead | Compliance Officer the same day | POL-070, OPS-060 |
| Decision recorded in Tredgate Loan does not match the Decision Register | Senior Loan Officer | Compliance Officer | POL-050, POL-070 |
| Request to change a rate band or the standard risk envelope | Operations Lead | Credit Risk Analyst, then Platform Engineering through OPS-050 | POL-030, POL-040 |

Response times for the technical escalations are the incident severities of OPS-040: 15 minutes for S1, 1 hour for S2, 1 business day for S3.

## Handover between shifts

Branches that run two shifts hand over Tredgate Loan at the shift boundary with a five-minute spoken handover backed by a written entry in the shift log. The outgoing Operations Lead (or Senior Loan Officer acting as shift lead) covers the following points in order.

1. **System state.** Confirm the process is running: `GET /api/health` returns `{"status":"ok","uptimeSeconds":<n>}`. Note the `uptimeSeconds` value; an unexpectedly low number means the process was restarted during the shift and the restart should be in the log.
2. **Queue state.** Read the Pending tile in the UI summary and list every pending application with its `createdAt` date. Flag any application older than one business day; it must be decided during the incoming shift to meet the 2 business day SLA (OPS-020).
3. **Decisions awaiting sign-off.** Name any application above 100,000 USD that is waiting for a Credit Risk Analyst entry in the Decision Register. The application stays pending in Tredgate Loan until that entry exists.
4. **Open incidents.** State severity, time declared, and next update due (OPS-040). Hand over the on-call engineer's contact record if an S1 or S2 is open.
5. **Log observations.** Mention any warn (level 40) or error (level 50) lines seen during the shift that are not yet explained (RB-002).
6. **Backups.** State when `server/data/loans.json` was last backed up and where the copy is.
7. **Configuration deviations.** Any non-default `PORT`, `DATA_FILE`, `LOG_FILE`, or `LOG_LEVEL` in effect.

The incoming shift lead signs the shift log entry. If the process is not running at handover, the incoming shift lead starts it per RB-001 before the first applicant is served, and records the restart.
