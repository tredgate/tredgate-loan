---
id: OPS-020
title: Application Lifecycle and SLAs
section: Operations
tags: [lifecycle, status, pending, sla, backlog, auto-decide, core-banking]
updated: 2026-09-27
---

# OPS-020 Application Lifecycle and SLAs

## Purpose and the three statuses

This document describes the life of a Simple Personal Loan (SPL) application inside Tredgate Loan, from the moment a Loan Officer creates it to the moment the branch acts on the decision, and it sets the service levels Lending Operations commits to. It is written for Loan Officers, Senior Loan Officers, and Operations Leads; the technical field definitions are in REF-020.

An application in Tredgate Loan has exactly one `status` field with one of three values.

| Status | Meaning | Who can act |
|---|---|---|
| `pending` | Recorded, not yet decided. The only state in which the approve, reject, and auto-decide actions are available. | Loan Officer or Senior Loan Officer within their authority (POL-050) |
| `approved` | Final. The application is handed over to Tredgate Core Banking for disbursement. | Nobody; no further changes are possible |
| `rejected` | Final. The applicant receives a rejection letter. | Nobody; no further changes are possible |

Every new application is created as `pending`; the API does not accept a status on creation. Decisions are final by design: the system answers `409 Conflict` with the message `Loan with id <id> has already been decided (approved)` (or `(rejected)`) to any attempt to approve, reject, or auto-decide an application that is no longer pending. There is no undo, no reopen, and no edit of amount, term, or rate after creation. If a decision was wrong, or the applicant's circumstances change, the officer creates a new application and the old one stays in the record as history. The UI reflects this: the three action buttons appear only on pending rows, and decided rows show a dash.

## State diagram and transitions

The lifecycle has one entry point, one intermediate state, and two terminal states.

```
                         POST /api/loans
                         (UI: "Create Loan Application")
                                  |
                                  v
                          +---------------+
                          |    pending    |
                          +---------------+
                             |    |    |
      PATCH status=approved  |    |    |  PATCH status=rejected
      (UI: check mark)       |    |    |  (UI: cross)
                             |    |    |
                             v    |    v
                   +----------+   |   +----------+
                   | approved |   |   | rejected |
                   +----------+   |   +----------+
                        ^         |        ^
                        |         v        |
                        |  POST /api/loans/:id/auto-decide
                        |  (UI: lightning bolt)
                        |         |
                        +---------+---------+
                        amount <= 100,000     amount > 100,000
                        AND term <= 60        OR term > 60

   Any action on approved or rejected  -->  409 Conflict (no transition)
```

| Transition | Trigger | Log line written (OPS-060) |
|---|---|---|
| (none) to `pending` | Form submit or `POST /api/loans`; passes the four validation rules of RB-008 | `loan created` with `loanId`, `amount`, `termMonths` |
| `pending` to `approved` | Manual: check mark or `PATCH /api/loans/:id/status` with `{"status":"approved"}` | `loan status updated` with `loanId`, `status` |
| `pending` to `rejected` | Manual: cross or `PATCH /api/loans/:id/status` with `{"status":"rejected"}` | `loan status updated` with `loanId`, `status` |
| `pending` to `approved` or `rejected` | Automated: lightning bolt or `POST /api/loans/:id/auto-decide`; outcome per the standard risk envelope of POL-040 | `loan auto-decided` with `loanId`, `status` |

Auto-decide never escalates and never leaves an application pending: inside the envelope it approves, outside it rejects. An officer who wants an application above 100,000 USD or over 60 months approved must approve it manually with the authority defined in POL-050 and must not press the lightning bolt.

## Service levels for pending applications

Lending Operations commits to two service levels for SPL applications.

| Service level | Target | Applies to |
|---|---|---|
| Manual decision | Within 2 business days of `createdAt` | Every application that is not auto-decided |
| Automated decision | Immediate: the decision is recorded in the same request | Every application on which auto-decide is used |

A business day is Monday to Friday, excluding the Tredgate public holiday calendar published each January by Compliance. The clock starts at the application's `createdAt` timestamp, which the system sets in UTC (for example `2026-09-25T11:30:00.000Z`). Convert it to branch local time before counting days. The day of creation is day 0; the deadline is close of business (17:00 branch local time) on business day 2.

| Created (branch local) | Day 1 | Day 2 = deadline |
|---|---|---|
| Monday 09:15 | Tuesday | Wednesday 17:00 |
| Friday 13:30 | Monday | Tuesday 17:00 |
| Thursday 16:50, Friday is a public holiday | Monday | Tuesday 17:00 |

The 2 business day target is deliberately generous so that applications above 50,000 USD have time to reach a Senior Loan Officer, and those above 100,000 USD have time for the Credit Risk Analyst sign-off in the Decision Register. It is not a reason to let small applications wait: an application inside the standard risk envelope that the officer intends to auto-decide should be auto-decided at creation, so the applicant leaves the branch with an answer.

The service level measures the decision in Tredgate Loan only. Disbursement times in Tredgate Core Banking and the KYC Desk's identity checks (which happen before the application is created) have their own service levels outside this handbook.

## What happens after a decision

Tredgate Loan records applications and decisions and nothing more. It does not disburse money, print letters, or notify anyone. The steps after a decision are manual and belong to Lending Operations.

**Approved.** The officer who made the decision, on the same business day:

1. Records the approval in the Decision Register if the amount is above 50,000 USD (POL-050), quoting the Tredgate Loan `id` (for example `ln-1004` or `muk5m5v2e3z5zkt`) as the reference.
2. Opens Tredgate Core Banking and books the disbursement with the same reference, amount, term, and rate as in Tredgate Loan. Core Banking owns everything from this point: disbursement, the repayment schedule, and arrears (POL-060).
3. Confirms the monthly installment shown to the applicant matches the Tredgate Loan table, which uses the flat-rate formula of POL-030: for 100,000 USD over 60 months at 0.085, total repayable is 108,500.00 USD and the installment is 1,808.33 USD.

**Rejected.** The officer, within 1 business day of the decision:

1. Sends the rejection letter from the Compliance template (POL-070). The letter states that the applicant may submit a new application; it never quotes the rate band or the auto-decide rule as the reason.
2. Notes the letter date in the branch correspondence log. Tredgate Loan keeps no record of the letter.

**Both.** Because decisions are final, an officer who realizes a mistake after clicking approve or reject does not try to reverse it. The officer informs the Senior Loan Officer, who decides whether a new application is created and, for an erroneous approval, contacts Tredgate Core Banking before disbursement.

## Measuring the SLA from createdAt and the log

The application record stores `createdAt` but no decision timestamp. The decision time therefore comes from the application log `logs/app.log`, where every decision produces exactly one line: `loan status updated` for a manual decision or `loan auto-decided` for an automated one, each carrying the `loanId` and the resulting `status` (OPS-060, RB-002).

The Operations Lead measures the SLA weekly with three steps.

1. List decided applications and their creation times: `GET /api/loans` returns every application with `id`, `status`, and `createdAt`.
2. For each application decided in the week, find its decision line: `grep '"loanId":"ln-1006"' logs/app.log` prints the `loan created` line and, if decided, the `loan status updated` or `loan auto-decided` line. The `time` field of the decision line is the decision timestamp in UTC.
3. Count business days between `createdAt` and the decision `time`. Anything over 2 is a breach and is recorded in the weekly SLA report with the `loanId` (never the applicant name).

Example. The record shows `"id":"ln-1006"`, `"createdAt":"2026-09-25T11:30:00.000Z"`. The log contains `{"level":30,"time":"2026-09-28T14:05:12.331Z","pid":10791,"hostname":"branch-ws-07","reqId":"7b1e90c2","loanId":"ln-1006","status":"approved","msg":"loan status updated"}`. Created Friday, decided the following Monday: 1 business day, within SLA.

Because manual rotation deletes log archives after 30 days (OPS-060), the weekly measurement must not be postponed; a decision line that has been rotated away cannot be recovered, and the application is then reported as "decision time unknown".

## Backlog handling and worked examples

The Pending tile in the UI summary is the backlog counter. The Operations Lead reads it at start of day, after lunch, and at end of day (OPS-030) and applies the following rules.

| Pending tile shows | Action |
|---|---|
| 0 to 5 | Normal. Loan Officers work the queue oldest first. |
| 6 to 15 | Operations Lead assigns the queue explicitly by `id` at the midday check and confirms every application older than 1 business day has an owner. |
| More than 15, or any application older than 2 business days | Backlog incident (S3, OPS-040). Senior Loan Officer joins the queue; the Operations Lead reports the breached `loanId`s to Compliance in the weekly SLA report. |

Applications are worked oldest first, using the Created column of the table, with one exception: an application that qualifies for auto-decide and needs no manual review is decided on the spot regardless of its position, because it costs one click.

Worked examples, all against a branch whose business hours are Monday to Friday:

- Application `ln-1006`, 45,000 USD over 36 months at 0.075, created Friday 2026-09-25 11:30 UTC. Inside the standard risk envelope and within Loan Officer authority. Expected handling: auto-decide or manual approval on creation; SLA deadline Tuesday 2026-09-29 17:00 if left pending.
- Application `ln-1004`, 100,000 USD over 60 months at 0.085, created Monday 2026-09-14. Exactly on both envelope limits, so auto-decide approves it. A manual approval instead needs a Senior Loan Officer (POL-050). Deadline Wednesday 2026-09-16 17:00; still pending on 2026-09-27 means a breach of 7 business days and a backlog incident.
- Application of 120,000 USD over 72 months. Outside the envelope; auto-decide would reject. If the branch wants it approved, a Senior Loan Officer approves manually after the Credit Risk Analyst sign-off is in the Decision Register. The 2 business day clock still applies, so the sign-off must be requested on the day of creation.
- Application of 300,000 USD over 12 months. Accepted by the system (it validates data shape only) but above the 250,000 USD product ceiling of POL-020. Any Loan Officer rejects it manually the same day.
