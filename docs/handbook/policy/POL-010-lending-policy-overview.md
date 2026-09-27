---
id: POL-010
title: Lending Policy Overview
section: Policy
tags: [policy, overview, spl, principles, ownership, scope, review-cycle]
updated: 2026-09-15
---

# POL-010 Lending Policy Overview

## Purpose of the lending policy

The Tredgate lending policy defines how Tredgate Financial Services decides whether to lend, to whom, at what price, and under whose authority. It exists so that every branch reaches the same decision on the same facts, so that applicants are treated consistently, and so that Credit Risk can measure and steer the quality of the loan book.

The policy has two layers. The first layer is the set of rules that the Tredgate Loan system enforces by itself: the shape of the application data (POL-020), the range of the interest rate (POL-030), the standard risk envelope used by automated decisioning (POL-040), and the finality of decisions (POL-050). The second layer is the set of rules that people enforce by procedure because the system does not: product fit, applicant eligibility, approval authority, four-eyes review, fees, and collections. Every policy document says which layer a rule belongs to. When a document says "Tredgate Loan enforces", the system refuses the request with an HTTP error. When it says "the officer must", the system accepts the request and the control rests on the person.

This overview introduces the Simple Personal Loan product, the principles behind the policy, the teams that own each part of it, the boundary between Tredgate Loan and the systems around it, and the cycle by which the policy is reviewed.

## The Simple Personal Loan product

Tredgate offers one lending product through Tredgate Loan: the Simple Personal Loan (SPL). It is an unsecured, fixed-price consumer loan denominated in US dollars, repaid in equal monthly installments.

| Attribute | Value | Enforced by |
|---|---|---|
| Currency | USD | Convention (the system stores a plain number) |
| Amount | 1,000 to 250,000 USD | Officer (POL-020); the system only requires a number greater than 0 |
| Term | 6 to 84 months | Officer (POL-020); the system only requires a whole number greater than 0 |
| Interest rate | One of five annual rate bands, A (0.05) to E (0.12), entered as a fraction | Credit Risk assigns the band (POL-030); the system requires a fraction between 0 and 1 inclusive |
| Pricing model | Flat rate: total repayable = amount × (1 + rate), installment = total / term | System (POL-030) |
| Decision | Manual (approve or reject) or automated within the standard risk envelope | System and procedure (POL-040, POL-050) |
| Servicing | Disbursement, repayment, fees, arrears | Tredgate Core Banking (POL-060) |

A worked example shows the product end to end. An applicant asks for 25,000 USD over 24 months. KYC Desk has verified identity and income, and Credit Risk has placed the applicant in Band C, so the rate is 0.08. The Loan Officer enters the application in Tredgate Loan; it is created with status `pending`. The total repayable is 25,000 × 1.08 = 27,000 USD and the monthly installment is 27,000 / 24 = 1,125.00 USD. Because 25,000 is at most 100,000 and 24 is at most 60, the application lies inside the standard risk envelope, so the officer may use the automated decision, which approves it. The approved application is then handed to Tredgate Core Banking for disbursement.

## Lending principles: affordability, transparency, and the standard risk envelope

Three principles run through every policy document.

**Affordability.** Tredgate lends only what an applicant can reasonably repay. Income evidence is verified by KYC Desk before an application is entered, and the Credit Risk scorecard translates that evidence into a rate band (POL-030). An officer who doubts affordability must reject, whatever the rate band says. Affordability is a human judgment; Tredgate Loan does not compute a debt-to-income ratio and does not store income.

**Transparency.** The applicant must be able to understand the price. That is why SPL uses a flat-rate formula that can be checked with a pocket calculator (POL-030), why the installment shown in the Tredgate Loan application list is the same figure quoted to the applicant, and why every rejection carries a reason code on the rejection letter (POL-050). Fees are published in a fixed schedule (POL-060) and are never embedded in the installment.

**Standard risk envelope.** Credit Risk defines a box inside which the risk is well understood: an amount of at most 100,000 USD and a term of at most 60 months, both inclusive. Inside the box, an application that has passed eligibility and product-fit checks may be decided automatically (POL-040). Outside the box, a person with the right authority must decide (POL-050). The envelope is encoded in Tredgate Loan as two constants, so changing it is a software release (OPS-050), not a memo.

When the principles conflict, affordability wins over the envelope: an application inside the envelope that the officer believes is unaffordable is rejected manually, not auto-decided.

## Ownership: who owns what

Four teams share responsibility for the policy and the system that implements it. Individual roles are defined in OPS-010; this table records ownership at the team level.

| Area | Owner | What ownership means |
|---|---|---|
| Lending policy (POL-010 to POL-070) | Credit Risk | Writes and approves the policy text, sets the product range, the rate bands, and the standard risk envelope limits, signs off manual approvals above 100,000 USD |
| Execution of the policy | Lending Operations | Loan Officers and Senior Loan Officers enter applications, decide them within their authority, and send applicant letters; the Operations Lead runs the daily checklist (OPS-030) and keeps the Decision Register at branch level |
| Tredgate Loan system | Platform Engineering | Owns the code, releases (OPS-050), configuration (REF-030), the on-call rota (OPS-040), and the runbooks (RB-001 to RB-008); implements policy changes that the system enforces |
| Compliance oversight | Compliance | KYC and AML standards, data handling and retention (POL-070), audits of decisions against the Decision Register and the application log |

The division has a practical consequence. A Loan Officer who believes the envelope limit should be 120,000 USD raises it with Credit Risk, not with Platform Engineering. Credit Risk decides, Platform Engineering implements, and Lending Operations applies the new limit only after the release is live on the branch workstation and the changelog records it.

## Scope of Tredgate Loan versus other systems

Tredgate Loan is a small, single-purpose system. It records loan applications and their decisions, and nothing else. Version 1.1 runs as a single instance on a branch workstation, serving a web user interface and a JSON API from port 3000, with one JSON data file and one log file (REF-040). It has no user accounts and no authentication.

| System | Responsibility | Relationship to Tredgate Loan |
|---|---|---|
| Tredgate Loan | Create applications; approve, reject, or auto-decide pending applications; show installments and status counts | The subject of this handbook |
| KYC Desk | Identity verification, residency, income evidence, sanctions and AML screening | Upstream: an application is entered only after KYC Desk has cleared the applicant; no KYC data is stored in Tredgate Loan |
| Decision Register | Ledger of manual approval sign-offs, including Senior Loan Officer and Credit Risk Analyst signatures | Parallel: enforces the authority ladder (POL-050) that the system cannot enforce |
| Tredgate Core Banking | Disbursement, loan accounts, repayment schedules, fees, arrears, collections, hardship arrangements, long-term record retention | Downstream: receives approved applications; owns everything after approval (POL-060) |

The boundary is strict in both directions. Tredgate Loan does not know whether a loan was disbursed, whether an installment was paid, or whether an applicant is in arrears. Core Banking does not know whether a decision was manual or automated; only the Tredgate Loan log knows that (POL-040).

## From application to decision: the standard path

The following procedure is the reference sequence that every other policy document assumes. Each step names the document that governs it.

1. **Eligibility and KYC.** KYC Desk verifies identity, age, residency, and income, and screens for AML. The officer confirms clearance before touching Tredgate Loan (POL-020, POL-070).
2. **Rate band.** Credit Risk assigns a band from A to E using the scorecard; the officer notes the fraction, for example 0.065 for Band B (POL-030).
3. **Product fit.** The officer checks that the amount is 1,000 to 250,000 USD and the term 6 to 84 months. Tredgate Loan does not check this (POL-020).
4. **Entry.** The officer creates the application in the Tredgate Loan form or via `POST /api/loans`. The system validates the data shape and returns the application with status `pending` (POL-020, REF-010).
5. **Decision path.** If the application is inside the standard risk envelope and the officer has no concerns, the officer may press the lightning-bolt button to auto-decide (POL-040). Otherwise the officer approves or rejects manually within the authority ladder, obtaining sign-offs in the Decision Register where required (POL-050).
6. **Communication.** The applicant receives an approval or rejection letter within the 2-business-day service level (POL-050, OPS-020).
7. **Handover.** Approved applications are passed to Tredgate Core Banking for disbursement; fees, repayments, and arrears live there from then on (POL-060).

Decisions are final. Once an application is approved or rejected, Tredgate Loan returns HTTP 409 to any further decision attempt; correcting a mistake means creating a new application (POL-050).

## Policy review cycle

Credit Risk reviews the lending policy on a fixed cycle so that the documents, the Decision Register practice, and the system stay aligned.

| Review | Frequency | Owner | Typical outcome |
|---|---|---|---|
| Rate band review | Quarterly | Credit Risk | Adjust one or more of the five band rates; publish new fractions to branches (POL-030) |
| Envelope review | Annually, or after any S1 or S2 incident involving decisions | Credit Risk with Platform Engineering | Confirm or change the 100,000 USD and 60-month limits; a change is a release (OPS-050) |
| Product range review | Annually | Credit Risk | Confirm or change 1,000 to 250,000 USD and 6 to 84 months (POL-020) |
| Fee schedule review | Annually | Credit Risk with Compliance | Update POL-060 |
| Full policy review | Annually, every September | Credit Risk, Lending Operations, Compliance | Re-issue all POL documents with a new `updated` date |
| Decision sample audit | Monthly | Compliance | Sample 20 decided applications; reconcile the log, the Decision Register, and the letters (POL-070) |

Every change to a policy document is made through a pull request as described in OPS-050, with the `updated` field in the frontmatter set to the approval date. A change that alters what the system enforces (for example the envelope constants or a validation message) must be released and recorded in the changelog before the policy text is published, so that the handbook never describes a system behavior that is not yet live.

## How to read the policy documents

The seven policy documents (POL-010 through POL-070) are written to be read in any order, and each `##` section is written to stand on its own, because most readers arrive at a section from a search. The documents share a fixed vocabulary.

| Term | Meaning |
|---|---|
| "Tredgate Loan enforces" / "the system returns" | A rule implemented in code; the system refuses the request with an HTTP error described in REF-010 and RB-008 |
| "The officer must" / "procedurally" | A rule that people apply; the system would accept the request |
| "Inclusive" | The boundary value satisfies the rule (100,000 USD is inside the envelope) |
| "Fraction" | An interest rate written as a decimal between 0 and 1, so 0.08 means 8 percent per year |
| "Application" | A loan application record in Tredgate Loan, with status pending, approved, or rejected |
| "Loan" | The disbursed account in Tredgate Core Banking; the word is also used loosely in API paths such as `/api/loans` |

Worked examples in the policy documents use the seed records shipped with Tredgate Loan (applications `ln-1001` to `ln-1006`, see REF-020), so that anyone can reproduce them on a freshly reset workstation with `npm run data:reset` (RB-006).
