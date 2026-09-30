---
id: REF-020
title: Data Model
section: Reference
tags: [data-model, loan-application, json-file, seed, status, identifiers, retention]
updated: 2026-09-27
---

# REF-020 Data Model

## The LoanApplication record

Tredgate Loan stores exactly one kind of record: the loan application. Its shape is the TypeScript interface `LoanApplication` in `shared/loan.ts`, shared by the API (`server/`) and the UI (`src/`). Every element of the data file, of the `GET /api/loans` response and of every write-endpoint response (REF-010) has these seven fields and no others.

| Field | Type | Constraint enforced by the system | Example |
|---|---|---|---|
| `id` | string | Unique within the data file; assigned by the server, never by the client | `"ln-1004"`, `"muk5m5v2e3z5zkt"` |
| `applicantName` | string | Non-empty after trimming; stored trimmed | `"Sipho Dlamini"` |
| `amount` | number | JSON number greater than 0; USD; decimals allowed; no upper bound | `100000` |
| `termMonths` | number | Whole number greater than 0; no upper bound | `60` |
| `interestRate` | number | From 0 to 1 inclusive; annual rate as a fraction, `0.085` = 8.5% p.a. | `0.085` |
| `status` | string | One of `pending`, `approved`, `rejected` | `"pending"` |
| `createdAt` | string | ISO 8601 timestamp in UTC, set by the server at creation | `"2026-09-14T15:22:00.000Z"` |

Product constraints are deliberately absent: the Simple Personal Loan range of 1,000 to 250,000 USD and 6 to 84 months (POL-020) and the rate bands of POL-030 are checked by the officer, not by the code, so an `amount` of 500 is stored without complaint. The monthly installment is **not** stored; the UI derives it with the flat-rate formula of POL-030 (for `ln-1004`, 100,000 x 1.085 / 60 = 1,808.33 USD).

## CreateLoanInput: what the client sends

A new application is created from a `CreateLoanInput`, defined in `shared/loan.ts` as the four applicant-supplied fields:

```json
{
  "applicantName": "Alice Smith",
  "amount": 25000,
  "termMonths": 12,
  "interestRate": 0.05
}
```

The server validates this object with `validateLoanInput` in `shared/loanRules.ts` (rules and 400 messages in REF-010 and RB-008), then builds the `LoanApplication` by adding three server-owned fields: `id` (generated, see "Identifier formats"), `status` (always `"pending"`) and `createdAt` (the current time, `new Date().toISOString()`).

Any other property in the request body is dropped. A client cannot pre-set `status` or `id`: sending `"status": "approved"` in a create request has no effect and the application still starts as pending. This is what makes the two-step create-then-decide process of OPS-020 enforceable.

## Status values and transitions

`status` takes one of three values from the `LoanStatus` type in `shared/loan.ts`: `pending`, `approved`, `rejected`. Only two transitions exist, both starting from `pending`:

```
              PATCH status=approved  or  auto-decide within the envelope
   pending  ─────────────────────────────────────────────────────────────▶  approved
      │
      │       PATCH status=rejected  or  auto-decide outside the envelope
      └──────────────────────────────────────────────────────────────────▶  rejected
```

| From | To | Triggered by |
|---|---|---|
| pending | approved | `PATCH /api/loans/:id/status` with `approved` (manual, POL-050), or `POST /api/loans/:id/auto-decide` when amount <= 100,000 and term <= 60 (POL-040) |
| pending | rejected | `PATCH` with `rejected`, or auto-decide when either limit is exceeded |

Any attempt to move an approved or rejected application returns `409 Loan with id <id> has already been decided (approved)` or `(rejected)`. The guard is `findPendingLoan` in `server/loanService.ts`, which every decision path goes through, so decisions are final at the system level. A wrong decision is corrected by creating a new application and recording the correction in the Decision Register (POL-050). A withdrawn application is rejected manually; there is no separate status. The UI shows decision buttons only on pending rows.

## Identifier formats

Two identifier formats appear in the data file.

**Seed identifiers** have the form `ln-` plus four digits, `ln-1001` to `ln-1006`. They exist only in `server/data/loans.seed.json`; the server never generates this form, so an `ln-1007` in a data file was typed by hand.

**Generated identifiers** come from `generateId` in `server/loanService.ts`:

```ts
Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
```

The result is a 15-character lowercase string of digits and letters, for example `muk5m5v2e3z5zkt`. The first 8 characters (`muk5m5v2`) are the creation time in milliseconds in base 36, so identifiers from one workstation sort in creation order; the last 7 are random and separate two applications created in the same millisecond. The scheme is not a UUID and is not guaranteed unique across workstations, which is acceptable because each workstation owns its own data file (REF-030).

Identifiers are case-sensitive, appear in URLs and in the `loanId` field of log lines (RB-002), and are what tickets and Decision Register entries quote instead of the applicant's name (POL-070).

## Timestamps

The only timestamp on a record is `createdAt`, set once by the server at `POST /api/loans` with `new Date().toISOString()` and never changed, not even by a decision. The format is ISO 8601 with milliseconds, always in UTC (`Z`) whatever the workstation's local zone, for example `2026-09-27T21:17:27.802Z`.

The UI shows the date part in the browser's local zone as `Sep 27, 2026`, so a record created shortly before midnight UTC can show a different calendar day in the UI than in the file. Log lines use the same ISO 8601 UTC format in `time`, so a `loan created` line and the record's `createdAt` match to the millisecond.

There is no decision timestamp. When a decision was made can only be reconstructed from the `loan status updated` or `loan auto-decided` log line (RB-002) or from the Decision Register.

## Data file layout and location

All applications live in one JSON file, by default `server/data/loans.json` under the installation folder; the `DATA_FILE` environment variable relocates it (REF-030). The file is a JSON **array** of `LoanApplication` objects, pretty-printed with two-space indentation exactly as `JSON.stringify(loans, null, 2)` produces:

```json
[
  {
    "id": "ln-1001",
    "applicantName": "Amara Ndlovu",
    "amount": 25000,
    "termMonths": 24,
    "interestRate": 0.08,
    "status": "approved",
    "createdAt": "2026-08-03T09:15:00.000Z"
  }
]
```

Rules that follow from `server/loanStore.ts`:

- **Created from the seed when missing.** The server reads the store at startup, before opening the port, and on every request; whenever the file is missing, its folder is created and `server/data/loans.seed.json` is copied there. Deleting the file is therefore a reset with data loss; `npm run data:reset` performs the same copy deliberately (RB-006).
- **Creation order, whole-file rewrite.** New applications are appended, nothing is removed or reordered, and every create or decision rewrites the entire file.
- **Must parse as JSON.** An empty or truncated file, or a hand edit with a trailing comma, makes every request touching the file fail with `500` while `GET /api/health` still returns `200` (RB-003, KI-001).
- **Not committed.** `.gitignore` excludes `server/data/loans.json` and `server/data/*.tmp`.

Hand edits are allowed only with the server stopped (RB-001) and must leave a valid array.

## Seed content

`server/data/loans.seed.json` is the committed starting data set, copied to the live file when it is missing and by `npm run data:reset` (RB-006), and used as the fixture for every automated test (REF-050). The installment column is not stored; it is amount x (1 + rate) / term (POL-030), rounded to cents.

| id | applicantName | amount (USD) | termMonths | interestRate | status | createdAt | Monthly installment |
|---|---|---|---|---|---|---|---|
| ln-1001 | Amara Ndlovu | 25,000 | 24 | 0.08 | approved | 2026-08-03T09:15:00.000Z | 1,125.00 |
| ln-1002 | Thabo Mokoena | 120,000 | 72 | 0.07 | rejected | 2026-08-11T13:40:00.000Z | 1,783.33 |
| ln-1003 | Jana Nováková | 60,000 | 48 | 0.09 | pending | 2026-09-02T08:05:00.000Z | 1,362.50 |
| ln-1004 | Sipho Dlamini | 100,000 | 60 | 0.085 | pending | 2026-09-14T15:22:00.000Z | 1,808.33 |
| ln-1005 | Petra Svobodová | 8,000 | 12 | 0.05 | approved | 2026-09-20T10:00:00.000Z | 700.00 |
| ln-1006 | Lerato Khumalo | 45,000 | 36 | 0.075 | pending | 2026-09-25T11:30:00.000Z | 1,343.75 |

The seed exercises the policy boundaries: `ln-1002` lies outside the envelope of POL-040 on both counts, `ln-1004` sits exactly on both limits, and `ln-1003` needs a Senior Loan Officer (POL-050). All names are fictitious.

## Atomic writes and serialized updates

Two mechanisms in `server/loanStore.ts` protect the data file; both arrived in release 1.1.0 after incident KI-001.

**Atomic write.** `save()` never writes into `loans.json` directly. It writes the complete new content to the sibling file `loans.json.tmp`, then renames it over `loans.json`. A rename inside one folder is a single file-system operation, so a reader sees either the old complete file or the new complete file, never a half-written one. If the process stops between the two steps, `loans.json` is untouched and a stale `loans.json.tmp` remains; it is harmless, ignored by version control and overwritten by the next write.

**Serialized updates.** `update(mutate)` chains every write behind the previous one through a promise chain. Each update performs read, mutate, save as one unit before the next begins, so two officers deciding two applications in the same instant cannot overwrite each other's change: the second update reads the file the first one wrote. A failed update (for example on a corrupted file) does not block later ones.

Limits: serialization is in-process only, so two server processes on the same `DATA_FILE` can lose updates (one process per file, REF-030), and there is no automatic backup copy.

## What is not stored

Tredgate Loan records **applications and decisions**, nothing else. The following are absent by design:

| Not stored | Where it lives instead |
|---|---|
| Who approved or rejected, and when | Decision Register (POL-050); the `loan status updated` / `loan auto-decided` log lines give time and `loanId` (RB-002) |
| Reason or notes for a decision | Decision Register |
| Identity data (ID number, date of birth, address, contact details, income) | KYC Desk |
| Disbursement, repayment schedule, arrears | Tredgate Core Banking (POL-060) |

The only personal data in the system is `applicantName`, shown in the UI and stored in the data file but **never** written to the log: the `loan created` line carries `loanId`, `amount` and `termMonths` only. Tickets and Decision Register entries reference applications by `id` (POL-070).

## Retention under POL-070

POL-070 sets the retention period and the disposal procedure for application records and logs. Release 1.1 automates none of it:

- **Nothing is deleted by the system.** There is no delete endpoint (REF-010), no archive flag and no scheduled clean-up. A record stays in the data file until a person removes it.
- **Disposal is a manual, stop-the-server operation.** The Operations Lead stops Tredgate Loan (RB-001), copies the data file to the archive location named in POL-070, removes expired records from the array or restores the seed with `npm run data:reset` (RB-006), and restarts. The file must remain a valid JSON array; archived copies fall under the same retention period.
- **Logs hold no names but are still governed.** `logs/app.log` contains `loanId` values only; it grows without bound and is rotated or deleted on the schedule in OPS-060 and POL-070.

Where POL-070 and this reference appear to differ, POL-070 prevails.
