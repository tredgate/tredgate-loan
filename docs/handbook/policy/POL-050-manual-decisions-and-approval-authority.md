---
id: POL-050
title: Manual Decisions and Approval Authority
section: Policy
tags: [manual-decision, approval-authority, four-eyes, decision-register, rejection-reasons, 409]
updated: 2026-09-15
---

# POL-050 Manual Decisions and Approval Authority

## Purpose and scope

A manual decision is an approval or rejection of a pending Simple Personal Loan (SPL) application chosen by a person rather than by the automated decisioning rules in POL-040. They are the only path for applications outside the standard risk envelope (amount above 100,000 USD or term above 60 months) and the preferred path whenever an officer has a concern the envelope does not capture.

This document defines the approval authority ladder, how it is enforced when the system has no user accounts, how a decision is recorded, why decisions are final, the reason codes and letters, conflicts of interest, and what to do when a decision is wrong. Fees and everything after approval are covered in POL-060; personal data and audit in POL-070.

## The approval authority ladder

Approval authority is determined by the application amount alone. The term does not change the tier, and neither does the rate band. Rejections are not tiered: any Loan Officer may reject any application.

| Amount (USD) | Minimum authority to approve | Recorded in the Decision Register |
|---|---|---|
| Up to 50,000.00 | Loan Officer | Loan Officer entry |
| 50,000.01 to 100,000.00 | Senior Loan Officer | Senior Loan Officer signature |
| Above 100,000.00 | Senior Loan Officer plus Credit Risk Analyst sign-off | Both signatures, Credit Risk Analyst last |
| Any amount, rejection | Loan Officer | Reason code on the rejection letter; no register entry required |

The tiers are inclusive at the top: 50,000.00 USD is a Loan Officer decision, 50,000.01 USD is a Senior Loan Officer decision, 100,000.00 USD is a Senior Loan Officer decision, and 100,000.01 USD requires Credit Risk. The top of the second tier coincides with the amount limit of the standard risk envelope (POL-040), so every application that needs Credit Risk sign-off is outside the envelope and could never be auto-approved.

An application inside the envelope may be approved automatically, with no register entry because Credit Risk has pre-approved the envelope, or manually, in which case the ladder applies in full.

## Procedural enforcement: no authentication in version 1.1

Tredgate Loan version 1.1 has no user accounts and no roles. Anyone with access to the branch workstation, or to port 3000 on it, can create and decide applications. The system records the outcome and the time, never the person. The approval authority ladder is therefore enforced entirely by procedure, and the Decision Register is the instrument.

The Decision Register is a ledger kept by the Operations Lead at each branch. Every manual approval has an entry made **before** the status is changed in Tredgate Loan, containing:

1. The Tredgate Loan application identifier (for example `ln-1003` or `muk5m5v2e3z5zkt`).
2. The amount, term, and rate as shown in the application list.
3. The KYC Desk clearance reference and the Credit Risk band letter.
4. The name and signature of the deciding officer, and, where the tier requires it, of the Senior Loan Officer and the Credit Risk Analyst.
5. The date and time the status was changed.

The Operations Lead reconciles the register against the application log every business day (OPS-030): each `loan status updated` line with `"status":"approved"` must have a register entry with a matching identifier, a time within a few minutes of the log line, and signatures that satisfy the tier. A line without an entry, or an entry with insufficient signatures, is reported to Compliance the same day (POL-070). Because the system cannot prevent the breach, detection within one business day is the control.

## Recording a manual decision in Tredgate Loan

A manual decision is recorded in one of two equivalent ways. In the web user interface, each pending row in the application list shows a check mark button (Approve) and a cross button (Reject); decided rows show a dash and no buttons. Through the API, the same action is `PATCH /api/loans/<id>/status` with the body `{"status": "approved"}` or `{"status": "rejected"}`.

| Situation | HTTP response | Body |
|---|---|---|
| Pending application, valid status | 200 | The application with the new status |
| Body status is anything other than `approved` or `rejected` (for example `maybe`, or `pending`) | 400 | `{"error": "Status must be 'approved' or 'rejected'"}` |
| Unknown identifier | 404 | `{"error": "Loan with id <id> not found"}` |
| Application already decided | 409 | `{"error": "Loan with id <id> has already been decided (approved)"}` or `(rejected)` |

A successful decision writes an information line `loan status updated` to the log with the `loanId` and the new `status`, followed by a `request completed` line for the PATCH request, both carrying the same `reqId` (OPS-060). An automated decision writes `loan auto-decided` instead, so the two are distinguishable (POL-040).

The procedure for an approval is: confirm the checks in POL-020 and POL-030 are complete; determine the tier from the amount; obtain and record the signatures in the Decision Register; press the check mark or send the PATCH; confirm the row now shows `approved`; issue the letter; hand over to Tredgate Core Banking (POL-060). For a rejection the register step is replaced by choosing a reason code for the letter.

## Decisions are final

Once an application is `approved` or `rejected`, its status can never change. Tredgate Loan enforces this with HTTP 409 on any further approve, reject, or auto-decide request, and the buttons disappear from the row in the user interface. There is no undo, no reopen, and no administrative override; editing the data file by hand is prohibited (POL-070).

Exactly one `loan status updated` or `loan auto-decided` line therefore exists for every decided application, which auditors rely on (POL-070).

A decision is a commitment, so everything that could change it happens before the button is pressed: the register entry, the signatures, the reason code, and a last look at the amount, term, and rate. If a decision must be revisited, the remedy is a new application (see the final section of this document).

## Rejection reasons and communication to the applicant

Every decision is communicated in writing within the 2-business-day service level (OPS-020). Tredgate Loan stores no reason and sends no letters; the officer prepares the letter from the branch templates and files a copy in the branch correspondence file with the application identifier.

| Reason code | Meaning | Typical trigger |
|---|---|---|
| R01 | Outside product range | Amount below 1,000 or above 250,000 USD, or term below 6 or above 84 months (POL-020) |
| R02 | Affordability | Verified income does not support the installment |
| R03 | Eligibility or KYC not satisfied | No KYC Desk clearance, age, residency, or AML screening failure |
| R04 | Data error, replaced by a new application | Wrong rate, amount, or term entered; the letter names the new application identifier |
| R05 | Withdrawn or duplicate | Applicant withdrew, or a duplicate record was created |
| R06 | Outside standard risk envelope, approval authority not granted | Senior Loan Officer or Credit Risk Analyst declined to sign |

Two letter templates exist. **L-APP-01 (Approval)** states the amount, the term, the band rate as a flat rate on the original amount, the total repayable, the rounded monthly installment (POL-030), the origination fee (POL-060), and the application identifier. **L-REJ-01 (Rejection)** states the reason code in plain language, the application identifier, and the right to reapply; it never quotes scorecard points or the band letter.

A worked example: `ln-1002`, 120,000 USD over 72 months at 0.07, is rejected because the Credit Risk Analyst declines to sign. The Loan Officer presses the cross button, the log records `loan status updated` with `"status":"rejected"`, and the L-REJ-01 letter carries R06 and the identifier `ln-1002`.

## Conflicts of interest

An officer must not take part in any decision on an application where they have a personal interest. A personal interest exists when the applicant is the officer, a household member, a relative, a business partner, or a creditor or debtor of the officer.

The rules are:

1. The officer declares the conflict to the Operations Lead before the application is created, or as soon as it is recognized.
2. The application is entered and decided by a different officer; for amounts above 50,000 USD the Senior Loan Officer must also be free of conflict.
3. The Decision Register entry records the declaration and the name of the substitute officer.
4. The conflicted officer does not use auto-decide either; pressing the lightning-bolt button is still taking the decision.
5. A conflicted decision discovered after the fact is reported to Compliance (POL-070); because decisions are final, the record cannot be reversed in Tredgate Loan, and Compliance decides with Credit Risk whether the Core Banking account is maintained.

Because the system does not know who pressed the button, the declaration is the primary evidence; the log records only the workstation `hostname` and the time, which the daily reconciliation compares with the register and branch attendance.

## Four-eyes examples

The following worked examples show the ladder applied to concrete applications.

**Example 1: 45,000 USD over 36 months at 0.075, `ln-1006`.** The installment is 45,000 × 1.075 / 36 = 1,343.75 USD. The amount is at most 50,000 USD and the application is inside the standard risk envelope. A Loan Officer may either auto-decide (approved, no register entry) or approve manually after making a Loan Officer register entry.

**Example 2: 60,000 USD over 48 months at 0.09, `ln-1003`.** Installment 60,000 × 1.09 / 48 = 1,362.50 USD. The amount is in the 50,000.01 to 100,000 tier. If the Loan Officer decides manually, a Senior Loan Officer signature is required in the register before the check mark is pressed. Alternatively, because the application is inside the envelope, the Loan Officer may auto-decide without a signature.

**Example 3: 120,000 USD over 36 months, Band A (0.05).** Installment 120,000 × 1.05 / 36 = 3,500.00 USD. The amount exceeds 100,000 USD, so both a Senior Loan Officer signature and a Credit Risk Analyst sign-off are required, the analyst signing last. Auto-decide would reject it regardless of the band, so it must not be used; the register entry is completed, then the check mark is pressed.

## Handling a wrong decision

Because decisions are final, a wrong decision is corrected by creating a new application, never by changing the old one. "Wrong" includes a data entry error found after the decision, an approval without the required signatures, a rejection pressed on the wrong row, and an auto-rejection that should have gone through the manual path.

1. Stop. Do not attempt to decide the application again; the system returns 409 and logs a `request rejected` warning.
2. Record the mistake in the Decision Register: the identifier, what was wrong, who discovered it, and when.
3. If the applicant should have been approved (wrongly rejected), create a new application with the correct data, follow the ladder for its amount, approve it manually, and send L-APP-01. The letter and the register entry cite the rejected identifier.
4. If the applicant should have been rejected (wrongly approved), inform Compliance the same day (POL-070). The approved record stays as it is; Credit Risk and Compliance decide whether the application is handed to Core Banking or the account is closed before disbursement, and the applicant is informed by letter.
5. If the data was wrong (for example 2 months entered instead of 24), create the corrected application, decide it, and send an R04 letter that names the new identifier.

The wrong record remains in the data file and the log by design: the audit trail shows the mistake and the correction side by side. Repeated wrong decisions are reviewed by the Operations Lead and Credit Risk (OPS-010).
