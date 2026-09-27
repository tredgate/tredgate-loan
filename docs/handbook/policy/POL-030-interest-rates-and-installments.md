---
id: POL-030
title: Interest Rates and Installments
section: Policy
tags: [interest-rate, rate-bands, installment, flat-rate, rounding, scorecard, ki-002]
updated: 2026-09-15
---

# POL-030 Interest Rates and Installments

## Purpose and scope

This document sets out how a Simple Personal Loan (SPL) is priced: the five rate bands that Credit Risk maintains, the rule that a rate is always a fraction between 0 and 1, the flat-rate formula that Tredgate Loan uses to compute the monthly installment, and how the result is rounded for display. It also explains why the product is flat-rate rather than amortized and documents the 8-instead-of-0.08 mistake (KI-002).

The formula is implemented once, in the shared business rules module, and the same code is used by the web user interface, so the figure a Loan Officer reads in the application list is the figure quoted to the applicant and passed to Tredgate Core Banking at handover (POL-060). Credit Risk owns the rate bands and the scorecard; Lending Operations enters the fraction; Platform Engineering owns the formula in code and changes it only through the release process (OPS-050).

## Rate bands A to E

Credit Risk publishes five annual rate bands. A band is assigned per applicant, not per application, using the scorecard described later in this document. The rate is stored as a fraction of the principal per year.

| Band | Annual rate (fraction, as stored and entered) | Display in the application list | Typical applicant profile |
|---|---|---|---|
| A | 0.05 | 5.0% | Strong verified income, long clean credit history, existing Tredgate relationship |
| B | 0.065 | 6.5% | Good income and history, no adverse markers in the last 5 years |
| C | 0.08 | 8.0% | Standard profile; the most common band |
| D | 0.095 | 9.5% | Thin or short credit history, or income variability |
| E | 0.12 | 12.0% | Highest accepted risk; minor adverse markers older than 24 months |

A promotional rate of 0 (interest-free) exists for specific campaigns and requires a written Credit Risk instruction naming the applicant; the system accepts 0 because the rate rule is inclusive. No other rate may be entered. Any other rate is a data error: the system accepts it, because it checks only the range, and the officer must reject the application manually (R04) and create a corrected one (POL-050). The seed reference records shipped with the system (`ln-1002`, `ln-1003`, `ln-1004`, `ln-1006`) carry illustrative rates such as 0.075 and 0.09 that are not band values; they exist to verify the installation and the formula, not as pricing examples.

The bands are reviewed quarterly (POL-010). When a band changes, Credit Risk publishes the new fraction with an effective date; applications created earlier keep the rate they were entered with, because the rate is stored on the application and never recalculated.

## Rates are always fractions between 0 and 1

An interest rate in Tredgate Loan is a decimal fraction: 0.08 means 8 percent per year. This convention is enforced by the system. On creation, the API checks that `interestRate` is a number between 0 and 1, both inclusive, and otherwise rejects the application with HTTP 400 and the message:

```
Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)
```

The web form labels the field "Interest Rate (e.g., 0.08 for 8%)" and limits it to values from 0 to 1. The application list displays the rate multiplied by 100 with one decimal place, so 0.085 appears as 8.5% and 0.12 as 12.0%.

| Entered value | Accepted? | Meaning |
|---|---|---|
| 0.08 | Yes | 8% per year (Band C) |
| 0 | Yes | Interest-free (Credit Risk instruction required) |
| 8 | No, 400 | A percentage typed by mistake (KI-002) |
| -0.01 | No, 400 | Negative rates do not exist in the product |
| "0.08" (text) | No, 400 | Must be a JSON number, not a string |

The rule exists because the formula multiplies the principal by (1 + rate): a rate of 8 means 800 percent per year, and nothing in the arithmetic flags it. POL-020 lists the other validation rules.

## The flat-rate installment formula

Tredgate Loan computes the monthly installment with two operations, exactly as implemented in the shared business rules:

```
total repayable = amount × (1 + interestRate)
monthly installment = total repayable / termMonths
```

The rate is applied once to the whole principal, regardless of the term; interest does not compound. A 24-month loan at 0.08 costs 8 percent of the principal in total, not 8 percent per year of the declining balance.

To compute an installment by hand:

1. Add 1 to the rate: for Band C, 1 + 0.08 = 1.08.
2. Multiply by the amount: 25,000 × 1.08 = 27,000.00 USD (total repayable).
3. Divide by the term in months: 27,000 / 24 = 1,125.00 USD (monthly installment).
4. The total interest is the total repayable minus the amount: 27,000 − 25,000 = 2,000.00 USD.

None of the three inputs is a date, so two applications with the same amount, term, and rate always show the same installment. The result is not rounded or stored; the application list computes it from the stored fields every time.

## Worked examples

The first five rows are the reference cases used to verify any change to the formula (REF-050); the rest are seed records shipped with the system (REF-020).

| Amount (USD) | Term (months) | Rate | Total repayable (USD) | Monthly installment (displayed) | Total interest (USD) |
|---|---|---|---|---|---|
| 10,000 | 12 | 0.10 | 11,000.00 | 916.67 | 1,000.00 |
| 100,000 | 60 | 0.08 | 108,000.00 | 1,800.00 | 8,000.00 |
| 12,000 | 12 | 0 | 12,000.00 | 1,000.00 | 0.00 |
| 25,000 | 24 | 0.08 | 27,000.00 | 1,125.00 | 2,000.00 |
| 45,000 | 36 | 0.075 | 48,375.00 | 1,343.75 | 3,375.00 |
| 120,000 (`ln-1002`) | 72 | 0.07 | 128,400.00 | 1,783.33 | 8,400.00 |
| 60,000 (`ln-1003`) | 48 | 0.09 | 65,400.00 | 1,362.50 | 5,400.00 |
| 100,000 (`ln-1004`) | 60 | 0.085 | 108,500.00 | 1,808.33 | 8,500.00 |
| 8,000 (`ln-1005`) | 12 | 0.05 | 8,400.00 | 700.00 | 400.00 |

Two observations help when checking a quote. Total interest is simply amount × rate, so for 45,000 USD at 0.075 it is 3,375.00 USD whether the term is 12 or 84 months; a longer term lowers the installment but not the cost. When the total divides evenly by the term the installment is exact (1,800.00 for 108,000 over 60); otherwise the displayed figure is rounded (916.67 for an exact 916.666...).

## Rounding rules

Rounding in Tredgate Loan is a display matter only. The formula produces an unrounded number, and the application list formats it as US currency with exactly two decimal places, rounding to the nearest cent. Nothing rounded is written to the data file, which stores only `amount`, `termMonths`, and `interestRate`.

| Value | Where it appears | Rounding |
|---|---|---|
| Monthly installment | Application list, "Monthly Payment" column | Nearest cent, two decimals (916.666... shows as $916.67) |
| Amount | Application list, "Amount" column | Two decimals ($25,000.00) |
| Total Approved | Summary tile above the list | Whole dollars, no decimals ($33,000 for two approved applications of 25,000 and 8,000) |
| Interest rate | Application list, "Rate" column | One decimal of a percentage (0.085 shows as 8.5%) |

Because the displayed installment is rounded, multiplying it by the term does not always return the total repayable. For 10,000 USD over 12 months at 0.10, twelve installments of 916.67 sum to 11,000.04 USD, four cents more than the true total of 11,000.00 USD. Tredgate Loan has no repayment schedule and does not resolve this; Tredgate Core Banking builds the schedule at handover and absorbs the difference in the final installment, 916.63 USD in this example (POL-060). Officers quote the rounded monthly figure and the exact total repayable, never one multiplied by the other.

## Why SPL is flat-rate rather than amortized

Most consumer loans are amortized: interest accrues monthly on the outstanding balance, so early installments are mostly interest and late ones mostly principal. SPL deliberately does not work this way, for three reasons.

**Transparency.** The applicant can verify the price with a multiplication and a division (POL-010); the total interest is visible as amount × rate before the application is created.

**Operational simplicity.** One shared formula with no date inputs serves the user interface, the API, and every branch, so a quote never changes between the day it is given and the day it is decided.

**Predictability for Core Banking.** Equal installments with a known total make the handover a matter of copying three numbers.

A flat rate is not comparable with a quoted annual percentage rate on an amortized loan. For 10,000 USD over 12 months, a flat rate of 0.10 gives an installment of 916.67 USD and 1,000.00 USD of interest; an amortized loan at 10 percent nominal annual interest would give an installment of approximately 879.16 USD and about 549.91 USD of interest. The flat rate is therefore the more expensive of the two for the same headline number. Compliance owns the applicant disclosure wording that explains this (POL-070); officers must describe the band rate as a "flat rate on the original amount" and never as an "APR".

## The 8 versus 0.08 mistake

The worst pricing error in the history of Tredgate Loan was not a formula bug: officers accustomed to percentages typed 8 into the rate field intending 8 percent, and the formula computed total repayable = amount × (1 + 8) = amount × 9.

| Input | Total repayable (USD) | Monthly installment (USD) | Ratio to correct figure |
|---|---|---|---|
| 25,000 over 24 months at 0.08 (correct) | 27,000.00 | 1,125.00 | 1.00 |
| 25,000 over 24 months at 8 (mistake) | 225,000.00 | 9,375.00 | 8.33 |
| 10,000 over 12 months at 0.10 (correct) | 11,000.00 | 916.67 | 1.00 |
| 10,000 over 12 months at 10 (mistake) | 110,000.00 | 9,166.67 | 10.00 |

Installments came out roughly nine times too high; because 8 was a valid number, no error was raised and the log showed only ordinary `loan created` lines (KI-002). Version 1.1.0 rejects any rate outside 0 to 1 with the message `Interest rate must be between 0 and 1 (e.g. 0.08 for 8%)`, and the form label now includes the example.

Two lessons remain. First, an implausible installment is a data problem until proven otherwise: if installment × term exceeds 1.12 × amount (the highest band), the rate is wrong. Second, validation catches shape, not intent: 0.8 (80 percent) instead of 0.08 passes the range check, produces an installment about 1.67 times too high, and is caught only by comparing the entered value with the band table. Applications with a wrong rate are rejected manually with reason code R04 and re-entered (POL-050).

## How rate bands are assigned

Credit Risk assigns a band with a points-based scorecard applied to the evidence gathered by KYC Desk (POL-020).

| Scorecard input | Source | Points range |
|---|---|---|
| Verified monthly income relative to the requested installment | KYC Desk income evidence | 0 to 40 |
| Credit bureau score | Bureau report ordered by KYC Desk | 0 to 35 |
| Length of clean credit history | Bureau report | 0 to 15 |
| Existing Tredgate relationship in good standing | Tredgate Core Banking | 0 to 10 |

| Total points | Band | Rate |
|---|---|---|
| 85 to 100 | A | 0.05 |
| 70 to 84 | B | 0.065 |
| 55 to 69 | C | 0.08 |
| 40 to 54 | D | 0.095 |
| 25 to 39 | E | 0.12 |
| Below 25 | Decline | No application is entered |

The procedure is:

1. The Loan Officer requests a band from the Credit Risk Analyst, quoting the KYC Desk clearance reference.
2. The Credit Risk Analyst scores the applicant and returns the band letter and its fraction in writing.
3. The officer enters the fraction, not the letter and not a percentage, in the `interestRate` field.
4. The officer checks the displayed rate in the application list (for example 6.5% for Band B) against the written band before deciding.

Tredgate Loan stores neither the band letter nor the score; only the fraction is recorded, and an officer may not choose a rate. If circumstances change before the decision, the officer requests a new band and, if it differs, rejects the pending application (R04) and creates a new one.
