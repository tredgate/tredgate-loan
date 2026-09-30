---
id: POL-020
title: Eligibility and Application Data
section: Policy
tags: [eligibility, application-data, validation, product-fit, kyc, data-entry, 400]
updated: 2026-09-15
---

# POL-020 Eligibility and Application Data

## Purpose and scope

This document defines who may apply for a Simple Personal Loan (SPL), what data an application consists of, which checks the Tredgate Loan system performs on that data, and which checks remain the responsibility of the Loan Officer. It applies to every application entered in Tredgate Loan, whether through the web form or through `POST /api/loans`.

The central idea is a division of labor. Tredgate Loan validates the *shape* of the data: a name is present, the amount is a positive number, the term is a positive whole number, the rate is a fraction between 0 and 1. The officer validates *fit*: the applicant is eligible under this document, the amount and term are inside the product range (1,000 to 250,000 USD, 6 to 84 months), and the rate matches the band assigned by Credit Risk (POL-030). An application can pass every system check and still be one that Tredgate must not grant; in that case the officer rejects it manually (POL-050). This document keeps the two layers in separate sections and closes with the data entry mistakes seen most often at branches.

## Applicant eligibility, verified by KYC Desk

An applicant is eligible for an SPL when all of the following are true on the day the application is entered. Each criterion is verified and recorded by KYC Desk, and the Loan Officer must hold the KYC Desk clearance before creating the application.

| Criterion | Requirement | Evidence held by KYC Desk |
|---|---|---|
| Age | 18 years or older | Government-issued photo identification |
| Residency | Resident of the United States with a verifiable current address | Utility bill or lease dated within 90 days |
| Identity | Identity verified and sanctions screening clear | KYC Desk verification record, AML screening result |
| Income | Regular verifiable income sufficient for the requested installment; the officer applies judgment, the system computes nothing | Pay statements or tax filing for the last 12 months |
| Existing exposure | No SPL application for the same applicant pending in Tredgate Loan, and no SPL account in Stage 2 or later arrears in Tredgate Core Banking (POL-060) | Officer check in Tredgate Loan and Core Banking |

None of these criteria are known to Tredgate Loan, which has no field for age, residency, or income and will create an application for anyone. The control is procedural: an application created without a KYC Desk clearance is a policy breach and must be rejected manually with reason code R03 (POL-050). If it was already approved in error, the record cannot be changed and Compliance must be informed (POL-070).

Income is checked for affordability (POL-010): for 45,000 USD over 36 months at Band C (0.08) the installment is 45,000 × 1.08 / 36 = 1,350.00 USD, and the officer confirms that verified monthly income covers it alongside existing commitments.

## Required application data fields

Every application carries exactly four fields supplied by the officer. The system adds the identifier, the status, and the timestamp.

| Field | Type | Meaning | Example |
|---|---|---|---|
| `applicantName` | text | The applicant's legal name as verified by KYC Desk, first name then last name. Leading and trailing spaces are removed by the system. Nothing but the name goes in this field: no reference numbers, no notes | `Alice Smith` |
| `amount` | number | Principal requested, in US dollars. The entry form steps in whole dollars; the API accepts any positive number | `25000` |
| `termMonths` | whole number | Number of monthly installments | `24` |
| `interestRate` | number | Annual rate as a fraction between 0 and 1; 0.08 means 8 percent per year (POL-030) | `0.08` |

The system-generated fields are `id` (for example `muk5m5v2e3z5zkt`, or `ln-1001` for seed records), `status` (always `pending` on creation), and `createdAt` (ISO 8601 timestamp in UTC). Officers cannot set or change them.

There is no field for a KYC reference, a Core Banking account number, a rate band letter, or a decision reason; those live in KYC Desk, Core Banking, the Decision Register, and the applicant letter. The installment is not stored either; the UI computes it from amount, term, and rate (POL-030).

## System validation rules and error messages

Tredgate Loan checks the four fields whenever an application is created. The checks and messages are defined once, in the shared business rules module, and are used by the API. If any check fails, the API responds with HTTP 400 and a JSON body `{"error": "<message>"}`; the application is not created and the log records a warning line `request rejected` with the status and the reason (OPS-060).

| Rule | Passes when | Error message (verbatim) |
|---|---|---|
| Request body | The request carries a JSON object (sent with the `Content-Type: application/json` header); this only fails for scripted calls, never for the form | `Request body must be a JSON object` |
| Applicant name | The value is text and is not empty after removing surrounding spaces | `Applicant name is required` |
| Amount | The value is a number and is greater than 0 | `Amount must be a number greater than 0` |
| Term | The value is a whole number and is greater than 0 | `Term months must be a whole number greater than 0` |
| Interest rate | The value is a number and is between 0 and 1, both inclusive | `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)` |

Rules are checked in the order listed and only the first failure is reported.

The amount and the rate must be JSON numbers, not text: `"amount": "25000"` in quotation marks is rejected with the amount message, a check introduced in 1.1.0 after KI-003. The rate check is inclusive at both ends, so 0 (an interest-free promotional loan) and 1 both pass.

The web form runs a short pre-check of its own with shorter wording, then displays whatever message the API returns. The API messages are authoritative; RB-008 lists them with the other 400 responses.

## System validation versus product fit

The system checks data shape. Product fit is a policy matter and is not enforced by Tredgate Loan version 1.1.

| Check | Product rule | What the system does |
|---|---|---|
| Minimum amount | 1,000 USD | Accepts any amount greater than 0, so 500 USD is created as pending |
| Maximum amount | 250,000 USD | Accepts any amount, so 300,000 USD is created as pending |
| Minimum term | 6 months | Accepts any whole number greater than 0, so 3 months is created as pending |
| Maximum term | 84 months | Accepts any whole number, so 120 months is created as pending |
| Rate matches assigned band | Rate must equal the Band A to E fraction assigned by Credit Risk | Accepts any fraction between 0 and 1 |

The separation is deliberate: the product range is reviewed annually by Credit Risk (POL-010) and may change without a software release, while the shape rules are stable properties of the data. A future version may add product-range validation through OPS-050; this document will be updated when it does.

The consequence for officers is a mandatory step. Before creating an application, and again before deciding it, the officer confirms:

1. Amount is between 1,000 and 250,000 USD inclusive.
2. Term is between 6 and 84 months inclusive.
3. Rate equals the fraction for the band assigned by Credit Risk.

If any check fails, the officer must not use the automated decision. Auto-decide (POL-040) tests only the standard risk envelope (amount at most 100,000 USD, term at most 60 months); a 500 USD application over 3 months is inside the envelope and would be approved automatically. The officer rejects it manually with reason code R01, "outside product range" (POL-050).

## Examples of valid and invalid applications

The following table shows how the system and the officer treat representative applications. "System" is the HTTP response to `POST /api/loans`; "Officer" is the required action under this document.

| Applicant name | Amount | Term | Rate | System | Officer action |
|---|---|---|---|---|---|
| Alice Smith | 25000 | 12 | 0.05 | 201, status `pending` | Valid, inside envelope; may auto-decide |
| Sipho Dlamini | 100000 | 60 | 0.085 | 201 | Valid, on the envelope boundary; may auto-decide (approved) |
| Thabo Mokoena | 120000 | 72 | 0.07 | 201 | Valid product fit, outside envelope; manual decision with Senior Loan Officer and Credit Risk Analyst sign-off |
| Ben Carter | 500 | 3 | 0.08 | 201 | Outside product range on both counts; reject manually (R01); do not auto-decide |
| Maria Lopez | 300000 | 48 | 0.12 | 201 | Above product maximum; reject manually (R01) |
| (blank) | 25000 | 12 | 0.05 | 400 `Applicant name is required` | Fix the name and resubmit |
| Alice Smith | -5 | 12 | 0.05 | 400 `Amount must be a number greater than 0` | Fix the amount |
| Alice Smith | "25000" (text) | 12 | 0.05 | 400 `Amount must be a number greater than 0` | Import scripts must send a number (KI-003) |
| Alice Smith | 25000 | 12.5 | 0.05 | 400 `Term months must be a whole number greater than 0` | Terms are whole months |
| Alice Smith | 25000 | 12 | 8 | 400 `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)` | Enter 0.08 (KI-002) |

All five records in the upper block are accepted by the system and still require judgment. The 201 response means "well-formed", never "acceptable".

## Common data entry mistakes

A small number of mistakes account for most bad records. The system blocks the first three; the rest reach the pending queue and must be caught by the officer.

| Mistake | What happens in 1.1 | How to avoid it |
|---|---|---|
| Rate entered as a percentage (8 for 8%) | Rejected with the interest rate message. In earlier versions it was accepted and produced installments about nine times too high (KI-002) | Read the band table as fractions; the form label says "e.g., 0.08 for 8%" |
| Amount pasted as text by a script | Rejected with the amount message. Earlier versions showed `NaN` installments (KI-003) | Import scripts send JSON numbers without quotation marks |
| Term with decimals (12.5) or in years (2 for 24 months) | 12.5 is rejected; 2 is accepted and creates a 2-month application | Always enter months; 2 years is 24 |
| Amount in cents (2500000 for 25,000 USD) | Accepted; the record is 100 times too large and outside product range | Enter dollars; the form label says "Loan Amount ($)" |
| Name field used for notes ("Alice Smith KYC#4471") | Accepted; personal data mixed with references, breaching POL-070 | Only the name; references stay in KYC Desk |
| Duplicate submission (button pressed twice) | Two pending applications for the same applicant | Wait for the list to refresh; reject the duplicate manually (R05) |

A mistake discovered after the decision cannot be corrected in place: decisions are final, the system returns 409, and the officer creates a new application (POL-050).

## Handling applications outside the product range

An application that the system accepted but that fails product fit is handled with the following procedure, within the 2-business-day service level (OPS-020).

1. Confirm the failure against the product range table: amount below 1,000 or above 250,000 USD, or term below 6 or above 84 months.
2. If the failure is a data entry error (2 entered for 24 months), create a corrected application first.
3. Reject the out-of-range application manually with the cross button in the application list, or with `PATCH /api/loans/<id>/status` and body `{"status": "rejected"}`. Do not use the lightning-bolt button; auto-decide would approve an in-envelope, out-of-range application such as 500 USD over 3 months.
4. Issue the rejection letter with reason code R01 (outside product range) or R04 (data error corrected under a new application), as defined in POL-050.
5. If the applicant genuinely wants an amount above 250,000 USD or a term above 84 months, explain that the SPL product does not offer it; there is no exception process.

Any Loan Officer may perform this rejection at any amount. The log records `loan status updated` with the loan identifier and the status `rejected`, which Compliance uses to reconcile letters against decisions (POL-070).
