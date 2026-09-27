---
id: INDEX
title: Tredgate Loan Handbook
section: Index
tags: [index, handbook, overview]
updated: 2026-09-27
---

# Tredgate Loan Handbook

The handbook is the single source of truth for how Tredgate Financial Services runs the Simple Personal Loan process in its Tredgate Loan system. It covers lending policy, day-to-day operations, runbooks for the branch workstation, technical reference and the register of known issues.

All content is fictional and exists for training purposes. Tredgate Financial Services, its teams, products and procedures are invented.

## How the handbook is organized

| Section | Prefix | What you find there |
|---|---|---|
| Policy | POL | Lending rules owned by Credit Risk: eligibility, rates, automated and manual decisions, fees, compliance |
| Operations | OPS | How Lending Operations runs the system: roles, lifecycle, checklists, incidents, releases, logging standards |
| Runbooks | RB | Step-by-step procedures for Platform Engineering and Operations Leads when something goes wrong |
| Reference | REF | Technical reference: API, data model, configuration, architecture, testing |
| Known issues | KI | Register of incidents and bugs with symptoms, log signatures, root causes and fixes |
| Glossary | | Business and technical terms |
| Changelog | | Version history of Tredgate Loan |

Every document has an ID. Refer to documents by ID in tickets, incident notes and pull requests.

## Policy

- [POL-010 Lending Policy Overview](policy/POL-010-lending-policy-overview.md)
- [POL-020 Eligibility and Application Data](policy/POL-020-eligibility-and-application-data.md)
- [POL-030 Interest Rates and Installments](policy/POL-030-interest-rates-and-installments.md)
- [POL-040 Automated Decisioning](policy/POL-040-automated-decisioning.md)
- [POL-050 Manual Decisions and Approval Authority](policy/POL-050-manual-decisions-and-approval-authority.md)
- [POL-060 Fees, Arrears and Collections](policy/POL-060-fees-arrears-and-collections.md)
- [POL-070 Compliance, KYC and Data Handling](policy/POL-070-compliance-kyc-and-data-handling.md)

## Operations

- [OPS-010 Roles and Responsibilities](operations/OPS-010-roles-and-responsibilities.md)
- [OPS-020 Application Lifecycle and SLAs](operations/OPS-020-application-lifecycle-and-slas.md)
- [OPS-030 Daily Operations Checklist](operations/OPS-030-daily-operations-checklist.md)
- [OPS-040 Incident Management](operations/OPS-040-incident-management.md)
- [OPS-050 Change Management and Releases](operations/OPS-050-change-management-and-releases.md)
- [OPS-060 Logging and Monitoring Standards](operations/OPS-060-logging-and-monitoring-standards.md)

## Runbooks

- [RB-001 Starting and Stopping Tredgate Loan](runbooks/RB-001-starting-and-stopping.md)
- [RB-002 Reading the Application Log](runbooks/RB-002-reading-the-application-log.md)
- [RB-003 Data File Missing or Corrupted](runbooks/RB-003-data-file-missing-or-corrupted.md)
- [RB-004 Port Already in Use](runbooks/RB-004-port-already-in-use.md)
- [RB-005 Frontend Shows "Failed to load loan applications"](runbooks/RB-005-frontend-failed-to-load.md)
- [RB-006 Resetting and Seeding Data](runbooks/RB-006-resetting-and-seeding-data.md)
- [RB-007 Investigating a 500 Error](runbooks/RB-007-investigating-a-500-error.md)
- [RB-008 Validation Errors (400) Reference](runbooks/RB-008-validation-errors-reference.md)

## Reference

- [REF-010 API Reference](reference/REF-010-api-reference.md)
- [REF-020 Data Model](reference/REF-020-data-model.md)
- [REF-030 Configuration and Environment](reference/REF-030-configuration-and-environment.md)
- [REF-040 Architecture Overview](reference/REF-040-architecture-overview.md)
- [REF-050 Testing Strategy](reference/REF-050-testing-strategy.md)

## Known issues

- [Known Issues Index and Template](known-issues/README.md)
- [KI-001 Data File Truncated on Shutdown](known-issues/KI-001-data-file-truncated-on-shutdown.md)
- [KI-002 Interest Rate Entered as Percentage](known-issues/KI-002-interest-rate-entered-as-percentage.md)
- [KI-003 Amount as String Bypassed Validation](known-issues/KI-003-amount-as-string-bypassed-validation.md)
- [KI-004 Request Without JSON Content Type Returned 500](known-issues/KI-004-request-without-json-content-type-returned-500.md)

## Other

- [Glossary](glossary.md)
- [Changelog](changelog.md)

## Quick answers

| Question | Where to look |
|---|---|
| What gets approved automatically? | POL-040 (amount up to 100,000 USD and term up to 60 months, both inclusive) |
| How is the monthly installment calculated? | POL-030 (flat rate: amount × (1 + rate) / term) |
| Who may approve a 120,000 USD loan? | POL-050 (Senior Loan Officer plus Credit Risk Analyst sign-off) |
| The UI shows "Failed to load loan applications" | RB-005 |
| Every request returns 500 | RB-003, then RB-007 |
| What does each 400 message mean? | RB-008 |
| Which fields does the API accept? | REF-010, REF-020 |
| How do I read a log line? | RB-002, OPS-060 |

## Document conventions

Every document begins with frontmatter (`id`, `title`, `section`, `tags`, `updated`), followed by the ID and title as the heading. Sections are written so they can be read on their own, because readers usually arrive at one section from a search rather than reading a document top to bottom. Changes to any document go through a pull request as described in OPS-050.
