---
id: POL-040
title: Automated Decisioning
section: Policy
tags: [auto-decide, limits, approval, risk-envelope]
updated: 2026-09-15
---

# POL-040 Automated Decisioning

## Purpose and scope

Automated decisioning ("auto-decide") lets Tredgate Loan approve or reject a pending Simple Personal Loan (SPL) application without a Loan Officer choosing the outcome. The officer triggers it with the lightning-bolt button in the application list or with `POST /api/loans/<id>/auto-decide`; the system compares the application with the standard risk envelope defined by Credit Risk and sets the status to `approved` or `rejected` in one step.

This document defines the envelope, gives the complete decision table including the boundary cases, states when an officer may use auto-decide and when they must not, explains what happens to applications that are not pending, and describes the audit trail that the log provides. It also sets the process for changing the envelope limits. Auto-decide is a convenience for standard applications, not a substitute for the eligibility, product fit (POL-020), and rate band (POL-030) checks that precede it. Manual decisions are covered in POL-050.

## The standard risk envelope

The standard risk envelope is the region of amount and term inside which Credit Risk considers an SPL application low enough in risk to be approved without individual review, provided all preceding checks passed. It is defined by two limits, both inclusive:

| Limit | Value | Constant in the shared business rules |
|---|---|---|
| Maximum amount | 100,000 USD | `AUTO_APPROVE_MAX_AMOUNT = 100000` |
| Maximum term | 60 months | `AUTO_APPROVE_MAX_TERM_MONTHS = 60` |

An application is inside the envelope when **amount ≤ 100,000 AND termMonths ≤ 60**. Both conditions must hold. An application of exactly 100,000 USD over exactly 60 months is inside. An application of 100,000.01 USD over 12 months is outside, and so is 5,000 USD over 61 months.

The interest rate plays no part in the envelope. A Band E application (0.12) for 100,000 USD over 60 months is inside; a Band A application (0.05) for 100,001 USD is outside.

The envelope is narrower than the product range (1,000 to 250,000 USD and 6 to 84 months, POL-020) but not contained in it: the envelope has no lower bounds, so an application of 500 USD over 3 months, which is outside the product range, is nevertheless inside the envelope and would be approved automatically. That is why product fit must be checked before auto-decide is used.

## Decision table and boundary cases

Auto-decide produces exactly one of two outcomes. There is no "refer" or "escalate" result.

| Amount (USD) | Term (months) | Amount ≤ 100,000? | Term ≤ 60? | Outcome |
|---|---|---|---|---|
| 25,000 | 24 | Yes | Yes | approved |
| 100,000.00 | 60 | Yes | Yes | approved |
| 99,999.99 | 60 | Yes | Yes | approved |
| 100,000.01 | 60 | No | Yes | rejected |
| 100,000.00 | 61 | Yes | No | rejected |
| 100,000.01 | 61 | No | No | rejected |
| 120,000 | 72 | No | No | rejected |
| 50,000 | 84 | Yes | No | rejected |
| 250,000 | 12 | No | Yes | rejected |
| 500 | 3 | Yes | Yes | approved (but outside product range; must not be auto-decided) |

The seed records shipped with Tredgate Loan illustrate the table on a freshly reset workstation (RB-006):

- `ln-1004`, 100,000 USD over 60 months, pending: auto-decide returns `approved`. This is the boundary case and is covered by an automated test (REF-050).
- `ln-1003`, 60,000 USD over 48 months, pending: `approved`.
- `ln-1006`, 45,000 USD over 36 months, pending: `approved`.
- `ln-1002`, 120,000 USD over 72 months: already `rejected` in the seed, so auto-decide returns 409 rather than a decision. Had it been pending, the outcome would have been `rejected`.

The comparison is numeric and exact. There is no rounding of the amount before comparison, so 100,000.004 USD is outside the envelope even though it would display as $100,000.00 in the application list.

## When auto-decide may be used

Auto-decide is permitted only when every item in the following checklist is true. The officer, not the system, is accountable for the checklist.

1. KYC Desk has cleared the applicant for identity, age, residency, income, and AML screening (POL-020, POL-070).
2. The application is inside the product range: amount 1,000 to 250,000 USD, term 6 to 84 months (POL-020).
3. The interest rate equals the fraction for the band assigned by Credit Risk (POL-030).
4. The officer has no affordability concern. If there is one, the officer rejects manually; affordability outranks the envelope (POL-010).
5. The application is inside the standard risk envelope (amount ≤ 100,000 USD and term ≤ 60 months), so that the expected outcome is `approved`.
6. The application status is `pending`.

Item 5 deserves a comment. Auto-decide may technically be pressed on an application outside the envelope, and it will reject it. The policy discourages this: an officer who already knows an application is outside the envelope decides it manually (POL-050), so that the rejection letter carries an accurate reason and the Senior Loan Officer path is considered.

An application of 80,000 USD is inside the envelope and may be auto-decided without a Senior Loan Officer sign-off, because Credit Risk has pre-approved the envelope; the same application decided manually would need one (POL-050). Both paths are legitimate; the manual path is chosen when anything merits a second pair of eyes.

## Only pending applications can be auto-decided

Auto-decide applies exclusively to applications whose status is `pending`. The system enforces this:

| Situation | HTTP response | Body |
|---|---|---|
| Pending application inside the envelope | 200 | The application with status `approved` |
| Pending application outside the envelope | 200 | The application with status `rejected` |
| Application already approved | 409 | `{"error": "Loan with id <id> has already been decided (approved)"}` |
| Application already rejected | 409 | `{"error": "Loan with id <id> has already been decided (rejected)"}` |
| Unknown identifier | 404 | `{"error": "Loan with id <id> not found"}` |

A 409 response changes nothing. The application keeps its existing status, and the log records a warning line `request rejected` with status 409 and the reason text. The buttons are shown only for pending rows, so a 409 in practice means that two people acted on the same application within seconds, or that a script used a stale identifier.

Decisions are final, and auto-decide is a decision. There is no way to "re-run" auto-decide on an application after the envelope limits change, or to convert a manual rejection into an automated approval. If a decision must be revisited, a new application is created (POL-050).

## Auto-decide never escalates

Outside the envelope, auto-decide rejects. It does not refer the application to a Senior Loan Officer, does not mark it for review, and does not leave it pending. The system has no concept of a user, a role, or a queue, so it cannot escalate; rejection is the safe default.

The consequence is a strict rule for officers: **if you want a non-standard application approved, do not press the lightning-bolt button.** Approve it manually with the authority defined in POL-050.

| Application | Auto-decide outcome | Correct handling if approval is intended |
|---|---|---|
| 120,000 USD over 36 months, Band B | rejected (amount above 100,000) | Manual approval by a Senior Loan Officer with Credit Risk Analyst sign-off in the Decision Register |
| 60,000 USD over 72 months, Band C | rejected (term above 60) | Manual approval by a Senior Loan Officer (amount is in the 50,000.01 to 100,000 tier) |
| 30,000 USD over 84 months, Band D | rejected (term above 60) | Manual approval by a Loan Officer (amount at most 50,000) |
| 100,000 USD over 60 months, Band E | approved | Auto-decide is acceptable; boundary values are inside |

An accidental auto-rejection of a non-standard application that should have been approved cannot be reversed. The officer creates a new application with the same data, obtains the required sign-offs, and approves it manually; the rejected record remains in the data file and in the log as evidence of the mistake, and the Decision Register entry for the new application cites the rejected identifier (POL-050).

## Audit trail in the application log

Tredgate Loan does not store who decided an application or whether the decision was automated; the data file holds only the status (REF-020). The application log is therefore the sole record that a decision was made by auto-decide. Every automated decision writes two lines, correlated by the request identifier `reqId`:

```
{"level":30,"time":"2026-09-26T09:14:02.118Z","pid":10791,"hostname":"branch-ws-07","reqId":"3f9c1a70","loanId":"ln-1004","status":"approved","msg":"loan auto-decided"}
{"level":30,"time":"2026-09-26T09:14:02.124Z","pid":10791,"hostname":"branch-ws-07","reqId":"3f9c1a70","method":"POST","url":"/api/loans/ln-1004/auto-decide","status":200,"durationMs":9,"msg":"request completed"}
```

The message `loan auto-decided` carries the `loanId` and the resulting `status`. A manual decision writes `loan status updated` instead, so the two paths are distinguishable in the log even though they are indistinguishable in the data file. Applicant names are never written to the log; auditors join `loanId` to the data file or to the Decision Register when a name is needed (POL-070, OPS-060).

To answer "was application X auto-decided, and when?", an auditor searches the log file for the identifier and the message, for example `grep '"loanId":"ln-1004"' logs/app.log | grep 'auto-decided'`, following RB-002. If the line is absent but the status is decided, the decision was manual. An automated decision that rejected an application produces the same message with `"status":"rejected"`.

A 409 attempt on an already decided application also leaves a trace: a warning line `request rejected` with the reason text. The log is retained under POL-070 and must not be edited.

## Non-standard applications: what officers must do

An application outside the standard risk envelope is not a bad application; it is one that needs a person with the right authority. The procedure is:

1. Confirm the application is pending and complete: KYC clearance, product fit, correct band rate.
2. Determine the authority tier from the amount (POL-050): up to 50,000 USD, a Loan Officer; 50,000.01 to 100,000 USD, a Senior Loan Officer; above 100,000 USD, a Senior Loan Officer plus a Credit Risk Analyst sign-off. Note that a long term alone (61 to 84 months) does not raise the tier; the amount does.
3. Obtain the sign-offs and record them in the Decision Register before the status is changed in Tredgate Loan.
4. Approve with the check mark button or `PATCH /api/loans/<id>/status` with body `{"status": "approved"}`. Never use the lightning-bolt button.
5. Issue the approval letter and hand the application to Tredgate Core Banking (POL-060).

For rejection, any Loan Officer may press the cross button at any amount, recording the reason code on the letter. The 2-business-day service level (OPS-020) applies to non-standard applications exactly as to standard ones; sign-off gathering must fit inside it.

## Reviewing and changing the envelope limits

The envelope limits belong to Credit Risk but live in code, as the two constants in the shared business rules module. Changing them is therefore both a policy decision and a software release.

| Step | Owner | Output |
|---|---|---|
| 1. Proposal with loan book evidence (default rates by amount and term band) | Credit Risk | Written proposal naming the new values, for example 120,000 USD and 72 months |
| 2. Impact review: how many pending and historical applications would change outcome | Credit Risk with Lending Operations | Impact note |
| 3. Code change to the two constants, updated automated tests for the new boundaries, changelog entry | Platform Engineering | Pull request reviewed under OPS-050 |
| 4. Update of POL-040 (this document) and the handbook index quick answers | Credit Risk | Pull request with the same effective date |
| 5. Release to branch workstations and confirmation that `npm test` passes | Platform Engineering | Release note |
| 6. Branch communication with the effective date | Lending Operations | Notice to all officers |

The envelope is reviewed annually and after any S1 or S2 incident involving decisions (POL-010, OPS-040). Applications decided before the effective date keep their outcome; the change is not retroactive, and no application is re-decided. The authoritative values are always those in the shared business rules of the installed release, verified by the boundary tests in REF-050.
