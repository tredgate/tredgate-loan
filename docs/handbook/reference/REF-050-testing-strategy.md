---
id: REF-050
title: Testing Strategy
section: Reference
tags: [testing, vitest, ci, business-rules, api-tests, manual-checks, regression]
updated: 2026-09-27
---

# REF-050 Testing Strategy

## Test layers

Tredgate Loan has two automated test layers, both run by Vitest from the `tests/` folder. Together they hold 33 tests and finish in well under a second.

| Layer | File | Tests | What it exercises | How it runs |
|---|---|---|---|---|
| Business rules | `tests/loanRules.test.ts` | 18 | `validateLoanInput`, `decideLoan` and `calculateMonthlyPayment` from `shared/loanRules.ts`, called directly | In memory; no server, no files, no network |
| HTTP API | `tests/api.test.ts` | 15 | The five endpoints of REF-010 end to end: routing, JSON parsing, validation mapping, 404/409 guards, persistence | A real Express app started for **each test** on a random free port (`listen(0)`), with a fresh copy of the seed in a temporary folder and a silent logger |

The API layer is isolated from the workstation's real state. `beforeEach` creates a folder `tredgate-loan-XXXXXX` under the system temporary directory, builds a store on `<tmp>/loans.json` from the real seed and an app with `pino({ level: 'silent' })`; `afterEach` closes the server and deletes the folder. The live `server/data/loans.json`, `logs/app.log` and the `PORT`, `DATA_FILE` and `LOG_FILE` variables are never touched, so the suite is safe on a production workstation.

Two configuration details: `vitest.config.ts` sets the environment to `jsdom` for future Vue component tests, so `tests/api.test.ts` starts with `// @vitest-environment node`; and `tsconfig.server.json` includes `tests/**/*.ts`, so `npm run build` type-checks the tests with the server.

## How to run the tests

Run from the installation folder after `npm install`. No environment variables and no running server are required.

```bash
npm test                 # vitest run: all suites once, exit code 0 on success
npm run test:watch       # vitest: re-run affected tests on every file save
```

A healthy run looks like this (timings vary):

```
 ✓ tests/api.test.ts (15 tests) 63ms
 ✓ tests/loanRules.test.ts (18 tests) 2ms

 Test Files  2 passed (2)
      Tests  33 passed (33)
```

One file: `npx vitest run tests/api.test.ts`; tests whose name contains a text: `npx vitest run -t "auto-decides"`.

A failing test prints expected and received values with the file and line of the assertion, and the exit code is non-zero, which the CI pipeline and the release checklist in OPS-050 rely on: a release candidate with a red `npm test` is not installed anywhere. Platform Engineers run `npm test` before a pull request and after every merge; Operations Leads may run it on a workstation because it does not touch live data.

## What CI runs

Every push to `main` and every pull request targeting `main` runs the workflow in `.github/workflows/ci.yml` on a fresh `ubuntu-latest` runner with the current Node.js LTS release and read-only repository permissions. The steps, in order:

| Step | Command | Fails when |
|---|---|---|
| Set up Node.js | `actions/setup-node@v4`, `node-version: lts/*`, npm cache | the LTS release cannot be installed |
| Install | `npm ci` | `package-lock.json` does not match `package.json` |
| Lint | `npm run lint` | any ESLint error in `.ts`, `.vue` or `.js` files |
| Test | `npm run test` | any of the 33 tests fails |
| Build | `npm run build` | a TypeScript type error in UI, server, shared or tests, or a Vite build error |

The job is one sequence, so a lint failure stops the run before the tests. A pull request cannot be merged with a red run (OPS-050). The pipeline deploys nothing: installing a release on branch workstations is the manual procedure in OPS-050 and RB-001. Because the runner's Node.js version may differ from a workstation's (REF-030), tests assert on status codes for parser errors, whose wording is Node.js-specific, and on exact text only for Tredgate Loan's own messages.

## Adding a test for a new bug

Every bug fix that reaches a branch workstation needs a Known Issue entry (KI-README) and a regression test. The test is written **first**, so that it fails against the current code and proves the fix afterwards.

1. **Reproduce and record.** Reproduce with curl and note the exact status, body and log line; this becomes the KI entry's "Symptoms" and "Log signature".
2. **Pick the layer.** A fault in a rule (validation, decision, installment) goes to `tests/loanRules.test.ts`; anything involving HTTP status, routing, parsing or persistence goes to `tests/api.test.ts`. When in doubt, add one of each.
3. **Write the failing test.** Name it after the behavior you want, not the bug, mention the KI number in a comment, reuse the shared fixture and override only the field under test.
4. **Run and watch it fail** with `npx vitest run -t "<name>"`; it must be red because of the assertion, not a typo.
5. **Fix, then run everything.** `npm test` and `npm run lint` must pass; the pull request references the KI so entry, test and fix are linked.

The test added for KI-003 is the model. Before the fix an amount posted as a string was accepted; the test states the required behavior and fails on the old code:

```ts
it('rejects an amount sent as a string', async () => {
  const { status } = await api<ErrorBody>('/loans', {
    method: 'POST',
    body: JSON.stringify({ ...newLoan, amount: '25000' })
  })
  expect(status).toBe(400)
})
```

Its rules-layer counterpart, `rejects a non-numeric amount, e.g. a string from a raw HTTP request`, checks the exact message. Regression tests stay in the suite permanently.

## Test data conventions

The suites share a small, deliberate vocabulary of data so that a failure is readable without opening the file.

- **One valid baseline.** `newLoan` (API tests) and `validInput` (rule tests) are the same application: Alice Smith, 25,000 USD, 12 months, rate 0.05, inside the POL-040 envelope and within Loan Officer authority (POL-050), so it must always succeed.
- **Override one field at a time.** Invalid cases are written as `{ ...newLoan, amount: -5 }` or `{ ...validInput, interestRate: 8 }`, which makes the field under test obvious and keeps every other field valid.
- **Seed records are fixtures with roles** (REF-020): `ln-1001` approved (409 on a second decision), `ln-1002` rejected (409 on auto-decide), `ln-1003` pending (manual approval), `ln-1004` pending at exactly 100,000 USD and 60 months (the inclusive POL-040 boundary). Changing the seed means reviewing these tests.
- **Boundary values by name.** Rule tests use 100,000/60 (approved), 100,001/60 and 50,000/61 (rejected), 12.5 months (not whole), 8 instead of 0.08 (KI-002) and `'50000'` (KI-003).
- **Exact messages where the message is the contract.** The 400 texts listed in RB-008 are asserted verbatim; third-party texts (JSON parser) are not.
- **Fictitious people only.** Names in tests and seed are invented; real applicant data never enters the repository (POL-070).

## What is not covered and the manual UI checklist

The automated suites cover the rules and the API. They do **not** cover the Vue components (`LoanForm.vue`, `LoanList.vue`, `LoanSummary.vue`, `App.vue`, including client pre-checks and the error banner); the API client and the Vite proxy; the log format, `reqId` correlation and `LOG_LEVEL`; start-up wiring, the `data:reset` script and static serving of `dist/`; and the store's behavior under concurrent requests and with a corrupted data file (KI-001).

These are verified by hand before each release with this checklist, run in single-process mode (`npm start`) after `npm run data:reset`; record the outcome in the release notes (OPS-050).

| # | Action | Expected result |
|---|---|---|
| 1 | Open `http://localhost:3000` | Six rows; summary 6 total, 3 pending, 2 approved, 1 rejected, Total Approved $33,000 |
| 2 | Read row `ln-1001` | Rate `8.0%`, Monthly Payment `$1,125.00`, badge `approved`, dash in Actions |
| 3 | Create Alice Smith, 25000, 12, 0.05 | New pending row, Monthly Payment `$2,187.50`, form cleared, summary 7 total / 4 pending |
| 4 | Submit with a blank name | `Applicant name is required` under the form; no request sent |
| 5 | Enter interest rate `8` | The browser refuses the value (field maximum is 1) |
| 6 | Check mark on `ln-1003` | Badge `approved`, buttons replaced by a dash, Total Approved $93,000 |
| 7 | Lightning bolt on `ln-1004` | Badge `approved` (exactly on both limits) |
| 8 | Create 150000, 72, then lightning bolt | Badge `rejected` |
| 9 | Stop the server, click Retry | Banner `Failed to load loan applications: ...`; restart, Retry clears it |
| 10 | Open `logs/app.log` | `loan created`, `loan status updated`, `loan auto-decided` lines, each followed by `request completed` with the same `reqId` |

## Currently covered behaviors

What the 33 tests assert today, grouped by behavior. Use it to see whether a proposed change already has a safety net.

| Behavior | Layer | Tests |
|---|---|---|
| A valid application passes; failures are `LoanValidationError` | Rules | `accepts a valid application`, `throws LoanValidationError so the API can map it to 400` |
| Missing or non-object body is 400 `Request body must be a JSON object` (KI-004) | Rules, API | `rejects a missing body`, `rejects a request without a JSON body with 400` |
| Blank or whitespace name rejected | Rules | `rejects an empty applicant name` |
| Amount 0, negative or a string rejected | Rules, API | `rejects amount <= 0`, `rejects a non-numeric amount ...`, `rejects an amount sent as a string`, `rejects an invalid loan with 400 ...` |
| Term 0 or fractional rejected | Rules | `rejects termMonths <= 0`, `rejects a fractional term` |
| Rate below 0 or above 1 rejected | Rules | `rejects a negative interest rate`, `rejects an interest rate above 1, e.g. 8 instead of 0.08` |
| Envelope boundaries of POL-040 | Rules, API | five `decideLoan` cases (100,000/60 and 5,000/6 approved; 100,001/60, 50,000/61, 200,000/120 rejected) plus the two `auto-decides: ...` tests |
| Flat-rate installment of POL-030 | Rules | three `calculates monthly payment ...` cases: 916.67, 1,000 and 1,800 |
| Health and list endpoints | API | `reports health`, `lists the seeded loans` |
| Create returns 201, pending, id, createdAt, and persists | API | `creates a loan with pending status and persists it` |
| Malformed JSON is 400 | API | `rejects malformed JSON with 400` |
| Manual approval works; bad status is 400 | API | `approves a pending loan`, `rejects an unknown status value with 400` |
| Unknown id is 404 with exact message | API | `returns 404 for a loan that does not exist` |
| Decisions are final (409) for PATCH and auto-decide | API | `returns 409 when a decided loan is approved again`, `returns 409 when auto-deciding a decided loan` |
| Unknown `/api` route is JSON 404 | API | `returns 404 JSON for unknown API routes` |

Behaviors listed under "What is not covered" have no row here.
