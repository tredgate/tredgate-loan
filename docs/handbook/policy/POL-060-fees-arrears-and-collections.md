---
id: POL-060
title: Fees, Arrears and Collections
section: Policy
tags: [fees, arrears, collections, hardship, core-banking, handover, reporting]
updated: 2026-09-15
---

# POL-060 Fees, Arrears and Collections

## Purpose and scope

This document describes what happens to a Simple Personal Loan (SPL) after the application has been approved in Tredgate Loan: the fees Tredgate charges, how missed installments are staged and collected, what hardship arrangements are available, and how the loan is reported. All of these activities take place in Tredgate Core Banking. Tredgate Loan's involvement ends when an approved application is handed over; it never learns whether the loan was disbursed, paid, or defaulted.

It belongs in the Tredgate Loan handbook because the officers who use Tredgate Loan also quote fees, check arrears status before entering a new application (POL-020), and answer applicants' questions about what happens next. It also fixes the handover points between systems so that every fact has exactly one home. Credit Risk owns the fee schedule and the arrears policy and reviews both annually (POL-010); Lending Operations executes collections; Compliance reviews hardship decisions.

## Fee schedule

Fees are charged and collected in Tredgate Core Banking. They are never part of the installment computed by Tredgate Loan and never change the amount, term, or rate on the application; the approval letter L-APP-01 (POL-050) lists the origination fee separately from the installment.

| Fee | Amount | When charged | Notes |
|---|---|---|---|
| Origination fee | 1.5% of the approved amount, minimum 50 USD, maximum 1,500 USD | At disbursement, deducted from the proceeds | The installment is still computed on the full approved amount |
| Late payment fee | 25 USD per installment | When an installment is more than 10 days past due | At most one fee per installment |
| Returned payment fee | 15 USD | When a payment is reversed by the applicant's bank | In addition to any late payment fee |
| Early settlement fee | 1% of the remaining principal | On full early repayment | Waived once at least half of the installments have been paid |
| Hardship arrangement | No fee | | Late fees accrued during the arrangement are waived |

A worked example: an application for 25,000 USD over 24 months at Band C (0.08) is approved. The origination fee is 25,000 × 0.015 = 375.00 USD, so the applicant receives 24,625.00 USD, while the installment remains 27,000 / 24 = 1,125.00 USD. If the applicant settles early after 6 installments, the remaining principal is 25,000 × 18 / 24 = 18,750.00 USD and the early settlement fee is 187.50 USD, so the settlement figure is 18,937.50 USD; the unearned flat-rate interest for the 18 remaining months is not charged. After 12 installments, half the term has been paid, the fee is waived, and the settlement figure is the remaining principal of 12,500.00 USD.

At the edges of the product range, a 1,000 USD loan pays the 50 USD minimum and any loan of 100,000 USD or more pays the 1,500 USD maximum.

## Arrears stages

An installment is due on the same calendar day each month, starting one month after disbursement. Tredgate Core Banking assigns each account an arrears stage from the number of days the oldest unpaid installment is past due.

| Stage | Days past due | Core Banking action | Effect on new SPL applications |
|---|---|---|---|
| Current | 0 | None | None |
| Stage 1 | 1 to 30 | Reminder message on day 3 and day 15; late payment fee applied on day 11 | None |
| Stage 2 | 31 to 60 | Telephone contact by the branch, formal arrears letter, hardship assessment offered | Applicant not eligible for a new SPL (POL-020) |
| Stage 3 | 61 to 90 | Formal demand letter, account restricted, Senior Loan Officer review | Not eligible |
| Stage 4 | 91 or more | Default; referral to external collections; credit bureau reporting | Not eligible; existing account excluded from any hardship arrangement |

Stages advance automatically in Core Banking and regress when arrears, including fees, are cleared. Stage 2 or later is the exposure test Loan Officers apply before entering a new application: a Stage 2 applicant is rejected with reason code R03 (POL-050). Tredgate Loan has no knowledge of the stage, so the officer looks it up in Core Banking.

Tredgate Loan shows the original application as `approved` throughout; its status is a decision status, not an account status.

## Collections process

Collections is executed by Lending Operations at the branch that approved the application, using Tredgate Core Banking, and follows the stages above.

1. **Day 3 and day 15 (Stage 1).** Core Banking sends automated reminders. No officer action is required. The late payment fee of 25 USD is applied on day 11.
2. **Day 31 (Stage 2).** The Loan Officer telephones the applicant within 2 business days, records the outcome in Core Banking, sends the formal arrears letter, and offers a hardship assessment if circumstances have changed.
3. **Day 61 (Stage 3).** The Senior Loan Officer reviews the account, sends the formal demand letter giving 30 days to clear the arrears or agree to a hardship arrangement, and restricts the account to repayments only.
4. **Day 91 (Stage 4).** The account is in default: the Operations Lead refers it to the external collections partner, Core Banking reports it to the credit bureau, and hardship arrangements are no longer available.
5. **Recovery.** Amounts recovered are applied first to fees, then to interest, then to principal, in Core Banking. Any write-off requires Credit Risk approval.

Collections outcomes are never recorded in Tredgate Loan: no field exists for them, and the application record stays exactly as it was when approved. Officers who need the original terms consult the application list, where the amount, term, rate, and installment are displayed (POL-030).

## Hardship arrangements

A hardship arrangement is a temporary change to the repayment schedule in Tredgate Core Banking for an applicant whose circumstances have changed since approval, such as job loss, illness, or bereavement. It is available to accounts in Stage 1 to Stage 3 and is approved by a Senior Loan Officer, with Compliance reviewing a sample each quarter.

| Option | Terms | Limits |
|---|---|---|
| Payment holiday | Installments suspended, no late fees | Up to 3 consecutive months, once per loan |
| Term extension | Remaining principal spread over more months, installment reduced | Total term after extension at most 84 months |
| Reduced installment | Installment reduced for a period, shortfall added to the end of the schedule | Up to 6 months |

The procedure is:

1. The applicant provides evidence of the change in circumstances; the Loan Officer records it in Core Banking.
2. The officer proposes one option and computes the new schedule in Core Banking.
3. A Senior Loan Officer approves and signs the arrangement in Core Banking; the approval is also noted in the Decision Register for audit.
4. Late payment fees accrued since the start of the hardship period are waived; the origination fee is never refunded.
5. The applicant receives a written confirmation of the new schedule.

A worked example: an applicant with a 45,000 USD loan over 36 months at 0.075 (installment 1,343.75 USD) has paid 12 installments and requests a term extension. The remaining principal is 45,000 × 24 / 36 = 30,000 USD, and the remaining flat-rate interest is 3,375 × 24 / 36 = 2,250 USD, so 32,250 USD remains to be paid. Spreading it over 36 months instead of 24 gives a new installment of 895.83 USD and a total term of 48 months, within the 84-month limit.

The Tredgate Loan record does not change: the application still shows 45,000 USD, 36 months, 0.075, status `approved`, and an installment of 1,343.75 USD, because that was the decision. The arrangement is a Core Banking fact.

## What Tredgate Loan does not do

Tredgate Loan records loan applications and their decisions. The following are outside the system, and officers should not look for them in the application list or the API.

| Not in Tredgate Loan | Where it lives |
|---|---|
| Disbursement date and amount paid out | Tredgate Core Banking |
| Loan account number | Tredgate Core Banking; there is no field for it on the application |
| Repayment schedule, payments received, remaining balance | Tredgate Core Banking |
| Fees charged, waived, or refunded | Tredgate Core Banking |
| Arrears stage and collections notes | Tredgate Core Banking |
| Hardship arrangements | Tredgate Core Banking, noted in the Decision Register |
| Who approved an application and with which signatures | Decision Register (POL-050) |
| Rejection reason | Rejection letter L-REJ-01 in the branch correspondence file |
| KYC evidence and clearance reference | KYC Desk (POL-070) |

An application record has exactly seven fields: `id`, `applicantName`, `amount`, `termMonths`, `interestRate`, `status`, and `createdAt` (REF-020), and nothing changes after the decision. The `Total Approved` tile sums the amounts of approved applications; it is a total of decisions, not a balance, and does not fall as loans are repaid.

## Handover points between systems

The following table fixes where each fact crosses from one system to another, so that every fact has exactly one home.

| Event | From | To | What is passed |
|---|---|---|---|
| KYC clearance | KYC Desk | Loan Officer | Clearance reference (kept in KYC Desk, not entered in Tredgate Loan) |
| Rate band assignment | Credit Risk | Loan Officer | Band letter and fraction; only the fraction is entered (POL-030) |
| Application approved | Tredgate Loan | Tredgate Core Banking | `id`, `applicantName`, `amount`, `termMonths`, `interestRate`, `createdAt`, and the decision time from the log or the Decision Register |
| Account opened | Tredgate Core Banking | Decision Register | Core Banking account number, written against the Tredgate Loan `id` |
| Application rejected | Tredgate Loan | Applicant | Identifier and reason code on letter L-REJ-01 (POL-050) |
| Arrears stage change to Stage 2 or later | Tredgate Core Banking | Loan Officer | Consulted before entering any new application for the same applicant (POL-020) |
| End of 90-day branch retention | Tredgate Loan data file | Tredgate Core Banking (7-year retention) | Confirmation that every approved application has an account and every rejected one a filed letter (POL-070) |

Handover from Tredgate Loan to Core Banking is manual in version 1.1: the officer reads the approved application in the application list and opens the account in Core Banking within 1 business day. Because the account number is not stored in Tredgate Loan, the Decision Register is the only place where an application can be traced to its account, and completing that column is part of the daily checklist (OPS-030).

## Reporting

Lending Operations produces a monthly SPL report for Credit Risk. It combines figures from Tredgate Loan, the log, and Tredgate Core Banking.

| Metric | Source | How it is obtained |
|---|---|---|
| Applications created, approved, rejected, pending | Tredgate Loan | Summary tiles above the application list, or `GET /api/loans` counted by `status` |
| Total approved amount | Tredgate Loan | `Total Approved` tile (whole dollars) or the sum of `amount` over approved applications |
| Share of automated decisions | Application log | Count of `loan auto-decided` lines divided by the count of all decision lines (`loan auto-decided` plus `loan status updated`) |
| Decisions outside the 2-business-day service level | Application log and data file | `createdAt` compared with the time of the decision line (OPS-020) |
| Accounts opened, disbursed amount | Tredgate Core Banking | Standard Core Banking report |
| Arrears by stage, defaults, recoveries | Tredgate Core Banking | Standard Core Banking report |
| Hardship arrangements granted | Tredgate Core Banking and Decision Register | Count and type |

The key reconciliation is that the number of applications approved in Tredgate Loan during the month equals the number of SPL accounts opened in Core Banking for those identifiers, and that the approved amounts match. A difference means an approval that was not handed over or an account opened without a decision, and the Operations Lead investigates it the same day. Because the branch data file is reset every 90 days (POL-070), the monthly report is filed before the reset and never recomputed afterwards.
