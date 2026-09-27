---
id: CHANGELOG
title: Changelog
section: Changelog
tags: [changelog, versions, releases, upgrade, semantic-versioning]
updated: 2026-09-27
---

# Changelog

## How this changelog is organized

This changelog records every released version of Tredgate Loan, newest first. Versions follow semantic versioning, MAJOR.MINOR.PATCH, with a `-beta` suffix for a pilot version; the rules for choosing a number are in OPS-050. Each version lists its release date and up to three lists, **Added**, **Changed**, and **Fixed**, naming the Known Issue (KI-001 to KI-004) that a fix closes. A branch runs one version at a time; the installed version is written in the shift log at every release, and manual workstation steps appear under "Upgrade notes". Entries are drafted in the pull request that makes the change and finalized by Platform Engineering at release time.

## 1.1.0 (2026-09-15)

First version at all branches with a backend; closes the four Known Issues from the 1.1.0-beta pilot.

**Added**

- Structured logs with pino: JSON lines to standard output and `logs/app.log`, with a per-request `reqId` and the events `loan created`, `loan status updated`, `loan auto-decided` (OPS-060).
- `npm run data:reset`, which restores `server/data/loans.json` from the seed (RB-006).
- Shared business rules in `shared/loanRules.ts`, used by both server and UI.

**Changed**

- Decisions are final: any decision on a non-pending application returns `409 Conflict` with `Loan with id <id> has already been decided (approved)` or `(rejected)`.
- Data file writes are atomic (temporary file plus rename) and updates are serialized.
- Startup creates `server/data/loans.json` from the seed before the port is opened, and a busy port is reported with a level 50 `Tredgate Loan API failed to start` line and exit code 1 instead of a silent failure (RB-004).
- Strict validation of `applicantName`, `amount` (number greater than 0), `termMonths` (whole number greater than 0), and `interestRate` (0 to 1 inclusive); messages in RB-008.

**Fixed**

- KI-001: data file truncated when the process stopped mid-write; every request then failed with 500 (`SyntaxError: Unexpected end of JSON input` in the log).
- KI-002: a rate entered as a percentage (8 instead of 0.08) was accepted; installments were about nine times too high.
- KI-003: an amount posted as a string (`"50000"`) by an import script was accepted and showed `NaN` installments.
- KI-004: a `POST /api/loans` without the `Content-Type: application/json` header returned 500 `Internal server error`; it now returns 400 `Request body must be a JSON object`.

## 1.1.0-beta (2026-08-10)

Pilot release at one branch, introducing the server side.

**Added**

- Express API under `/api`: `GET /api/health`, `GET /api/loans`, `POST /api/loans`, `PATCH /api/loans/:id/status`, `POST /api/loans/:id/auto-decide` (REF-010).
- JSON file store at `server/data/loans.json`, created from `server/data/loans.seed.json` on first start, with plain file writes.
- `npm start` (builds the UI and serves UI and API from port 3000) and `npm run dev` (Vite UI on port 5173, API on port 3000).
- Environment variables `PORT`, `DATA_FILE`, `LOG_FILE`, `LOG_LEVEL` (REF-030).

**Changed**

- The UI reads and writes applications through the API instead of browser storage.

Known issues open in this version, all resolved in 1.1.0: KI-001 (first observed during the pilot), KI-002, KI-003, KI-004.

## 1.0.0 (2026-06-15)

First release, browser-only, installed at all branches from June 2026 and replaced by 1.1.0 in September 2026.

**Added**

- Vue web UI: application form, application table with approve, reject, and auto-decide buttons on pending rows, and the five summary tiles.
- Auto-decide rule: approved if amount is at most 100,000 USD and term at most 60 months, otherwise rejected (POL-040).
- Monthly installment per application with the flat-rate formula amount x (1 + rate) / term (POL-030).

**Limitations**

- All data lived in the browser's local storage; clearing browser data deleted every application.
- No server, API, or log file, so incidents could not be investigated from evidence; decisions could be changed after the fact.

## Upgrade notes: 1.0.0 to 1.1.0

The Operations Lead and a Platform Engineer perform the upgrade together outside business hours (OPS-050).

1. **Node.js 20.19 or newer is required on the branch workstation.** Version 1.0.0 needed only a browser. Check `node --version` before the window.
2. **Data is no longer in the browser, and there is no migration.** Applications entered in 1.0.0 stay in the browser's local storage. Before the upgrade, copy every pending application (name, amount, term, rate) from the 1.0.0 screen onto the branch worksheet; decided applications are already in Tredgate Core Banking and the Decision Register.
3. Run `npm install`, then `npm start`; confirm the log line `Tredgate Loan API started` and `GET /api/health` (RB-001). The data file is created from the seed with six sample records; before live use the engineer stops the process and replaces the file contents with an empty array `[]`.
4. Re-enter the pending applications from the worksheet. They receive new ids and `createdAt`; the 2 business day SLA (OPS-020) restarts.
5. Start the daily routine of OPS-030 (data file backup, log review) the same day.
6. Branch scripts posting to the API must send `amount` and `termMonths` as numbers and `interestRate` as a fraction between 0 and 1, or they receive 400 (RB-008).
