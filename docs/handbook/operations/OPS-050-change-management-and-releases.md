---
id: OPS-050
title: Change Management and Releases
section: Operations
tags: [change-management, release, pull-request, ci, semantic-versioning, rollback, definition-of-done]
updated: 2026-09-27
---

# OPS-050 Change Management and Releases

## Purpose and what counts as a change

This document governs every change to Tredgate Loan: source code, shared business rules, configuration defaults, seed data, the CI pipeline, and this handbook. It covers branching and pull requests, automated checks, the definition of done, version numbering, releases onto a branch workstation, rollback, and approvals. Platform Engineering owns the procedure; Lending Operations owns the release windows.

A change is anything merged into the `main` branch of the Tredgate Loan repository. No change is too small for a pull request: the branch workstation runs whatever is on `main` at release time, and the handbook is the branch's only description of how the system behaves. Three categories have different approval needs:

| Category | Examples | Extra approval beyond code review |
|---|---|---|
| Business rule | Anything in `shared/loanRules.ts`: validation messages, the auto-decide limits `AUTO_APPROVE_MAX_AMOUNT` (100,000) and `AUTO_APPROVE_MAX_TERM_MONTHS` (60), the installment formula | Credit Risk Analyst; matching policy document (POL-030, POL-040) updated in the same pull request |
| Data and logging | Fields written to the data file or the log, log messages, retention, backup handling | Compliance Officer (POL-070, OPS-060) |
| Everything else | UI, API routing, error handling, configuration, tests, documentation | Standard review only |

Workstation configuration changes (a non-default `PORT`, `DATA_FILE`, `LOG_FILE`, or `LOG_LEVEL`) are not repository changes but are recorded in the shift log and checked against REF-030 by the on-call engineer.

## Branching and pull requests

`main` is the protected release branch: nobody pushes to it directly, and every change arrives through a pull request that passes CI and has an approving review from a Platform Engineer who is not the author.

Branch names: `feature/<short-description>`, `fix/<short-description>` (reference the Known Issue where one exists, for example `fix/ki-003-amount-type-validation`), `docs/<short-description>` for handbook-only changes, and `release/<version>`.

Every pull request uses the template `.github/PULL_REQUEST_TEMPLATE.md` with six parts: Summary, Changes, How to Test, Checklist, Risks, and Screenshots (for UI changes). Its Checklist is the minimum:

- Code follows the project's coding guidelines
- Tests have been added or updated
- Lint passes (`npm run lint`)
- All tests pass (`npm run test`)
- Build succeeds (`npm run build`)

The CI workflow `.github/workflows/ci.yml` runs on every pull request targeting `main` and on every push to `main`. On an Ubuntu runner with the current Node.js LTS it executes, in order, `npm ci`, `npm run lint`, `npm run test`, `npm run build`; a failure in any step blocks the merge. The test step runs the business rule tests and the HTTP API tests against a temporary data file (REF-050), so a change that breaks a validation message, the 409 rule, or the auto-decide limits fails before a reviewer reads it.

Reviewers also check that the handbook change is in the same pull request, that no new log statement includes personal data such as `applicantName` (OPS-060), and that the Risks section states what a rollback would need.

## Definition of done

A change is done when all of the following are true. The author ticks them in the pull request; the reviewer verifies them.

1. **Behavior tested.** A new or changed behavior has a test in `tests/loanRules.test.ts` or `tests/api.test.ts`, and a fixed defect has a test that would have caught it. CI is green.
2. **Lint, tests, build pass locally** with `npm run lint`, `npm run test`, `npm run build`.
3. **Documentation updated: runbook and/or Known Issue entry in the handbook.** Specifically:
   - A defect fix references its Known Issue and updates the entry's Fix and Prevention sections, or creates the entry from `known-issues/README.md` when none exists.
   - A change to any error message, status code, route, field, log message, or operating procedure updates the affected document: REF-010, REF-020, RB-008, OPS-060, the runbooks RB-001 to RB-008, or OPS-030.
   - A business rule change updates the policy document and is approved by a Credit Risk Analyst.
4. **Changelog entry drafted** under the next version in `docs/handbook/changelog.md` (Added, Changed, or Fixed), referencing Known Issue numbers.
5. **No personal data in logs** confirmed by review of every new log call.
6. **Rollback described** in the Risks section: whether a revert is enough or a data file restore would be needed.

A code change that touches no document states why in its Summary; "docs later" is not acceptable.

## Semantic versioning

Tredgate Loan versions follow semantic versioning, `MAJOR.MINOR.PATCH`, with an optional pre-release suffix such as `-beta`.

| Part | Increment when | Example from the changelog |
|---|---|---|
| MAJOR | The data file format or the API changes in a way that an unchanged workstation or script would break, or data cannot be carried forward without a manual step | A change that renames data file fields would be 2.0.0 |
| MINOR | New behavior that is backward compatible: a new endpoint, a new log message, a new command | 1.1.0 added the API, the JSON file store, structured logs, and `npm run data:reset` |
| PATCH | A defect fix with no new behavior | A fix to a validation message would be 1.1.1 |
| Pre-release | A version released to a pilot branch only, not to all branches | 1.1.0-beta ran at one branch in August 2026 and surfaced KI-001, KI-002, and KI-003 |

Rules: Platform Engineering fixes the version at release time and records it as the changelog heading and a git tag `v<version>`; pull requests do not set version numbers. A pre-release is never installed at more than one branch. Stricter validation is MINOR, not MAJOR, when it only rejects input that was already wrong under policy (as 1.1.0 did for KI-002 and KI-003). Any change to the installment formula is MAJOR regardless of size, because installments already quoted to applicants would change.

## Release checklist

A Platform Engineer performs releases in a window the Operations Lead schedules outside business hours, one branch workstation at a time.

Before the release window:

1. CI is green on `main`; the changelog has the new version heading and date; the handbook changes are merged; Known Issue entries fixed by the release are marked resolved.
2. The Operations Lead has confirmed the window in the shift log and that `node --version` reports 22.19 or newer.
3. The rollback plan names the release commit, the previous tag, and whether a data file restore would be needed.

During the release window, on the workstation:

4. End-of-day steps of OPS-030 are complete. Take one more copy of the data file named with the version, for example `loans-pre-1.1.0.json`, and copy `logs/app.log` alongside it.
5. Stop the process with Ctrl+C (RB-001). Confirm `curl http://localhost:3000/api/health` is refused.
6. Update the working copy to the release tag and run `npm install`.
7. Start with `npm start`. Confirm the `Tredgate Loan API started` line shows `"servingFrontend":true` and the expected `dataFile` and `logFile`.
8. Smoke test without writing live data: the health endpoint returns `status: ok`; `curl http://localhost:3000/api/loans` returns the same record count as the pre-release backup; the UI loads tiles and table. For a write test, start a second instance against a scratch file (`PORT=3100 DATA_FILE=/tmp/smoke-loans.json LOG_FILE=/tmp/smoke.log npm start`), create and auto-decide one application there, then stop it.
9. Record version, time, engineer, and smoke test result in the shift log.

After the release:

10. The Operations Lead runs the start-of-day checklist (OPS-030) the next morning and reports any level 40 or 50 line with a new `reason` or `err.message` to the engineer, who watches for reports for 2 business days before the release is declared complete.

## Rollback

Rollback restores the previous version and, when necessary, the previous data. The on-call engineer decides it with the Operations Lead; it is preferred over a hot fix during business hours.

Code rollback:

1. Open a pull request that reverts the release commits with `git revert` (never a force push to `main`); CI runs on the revert like on any change. During an S1 the engineer checks out the previous release tag on the workstation immediately and files the revert pull request the same day.
2. On the workstation: stop the process (Ctrl+C), check out the previous tag, `npm install`, `npm start`, verify the `Tredgate Loan API started` line and the health endpoint.

Data rollback:

3. If the release changed the data file format, or the Total Applications tile after rollback differs from the pre-release backup count, stop the process, copy `loans-pre-<version>.json` over `server/data/loans.json`, and start again (restore procedure in RB-003). Applications created between release and rollback are then missing; their `loan created` log lines give `loanId`, `amount`, and `termMonths` but not the applicant name or rate, so the Loan Officer re-enters them from the paper file. This is why releases happen outside business hours.
4. Never use `npm run data:reset` as a rollback step; it restores the six seed records, not the branch's data (RB-006).

Every rollback is recorded as an incident of at least S2 and follows the postmortem and Known Issue rule of OPS-040.

## Who approves what

| Change | Author | Reviewer (required) | Additional approval | Executes on workstation |
|---|---|---|---|---|
| Code, tests, CI | Platform Engineer | Platform Engineer (not the author) | - | Platform Engineer |
| `shared/loanRules.ts` (validation, auto-decide limits, installment formula) | Platform Engineer | Platform Engineer | Credit Risk Analyst; policy document in the same pull request | Platform Engineer |
| Log content, data fields, retention, backup handling | Platform Engineer | Platform Engineer | Compliance Officer | Platform Engineer |
| Policy documents POL-010 to POL-070 | Credit Risk Analyst | Credit Risk Analyst (not the author) | Compliance Officer for POL-070 | - |
| Operations documents OPS-010 to OPS-060 | Operations Lead | Platform Engineer | Compliance Officer for OPS-060 | - |
| Runbooks RB-001 to RB-008, reference REF-010 to REF-050 | Platform Engineer | Operations Lead | - | - |
| Known Issue entries | Platform Engineer (on-call) | Operations Lead | - | - |
| Release to a branch workstation | Platform Engineer | - | Operations Lead schedules and confirms the window | Platform Engineer |
| Seed data `server/data/loans.seed.json` | Platform Engineer | Platform Engineer | Compliance Officer (the seed must contain no real applicant) | - |

Approval is given in the pull request itself so the trail is in one place; a verbal approval is written into the pull request by the approver before merge. The Operations Lead's release approval is the shift log entry naming the window and the version.
