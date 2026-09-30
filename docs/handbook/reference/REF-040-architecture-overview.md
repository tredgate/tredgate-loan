---
id: REF-040
title: Architecture Overview
section: Reference
tags: [architecture, components, request-flow, folder-layout, error-handling, logging, design-constraints]
updated: 2026-09-27
---

# REF-040 Architecture Overview

## Components

Tredgate Loan is one small code base with six clearly separated parts. All of them run on a single branch workstation under Node.js; nothing runs anywhere else.

| Component | Technology | Location | Responsibility |
|---|---|---|---|
| Web UI | Vue 3, TypeScript | `src/` | New-application form, application table with decision buttons, summary counters. Talks to the API only through `src/services/loanService.ts`. |
| Vite dev server | Vite | `vite.config.ts` | Development only: serves the UI source on port 5173 and forwards `/api` to port 3000. In single-process mode Express serves the built UI from `dist/` instead. |
| Express API | Express 5 on Node.js, run from TypeScript by `tsx` | `server/index.ts`, `server/app.ts` | The five endpoints of REF-010, request logging, JSON parsing, error mapping, optional static serving of `dist/`. |
| Shared business rules | Pure TypeScript functions, no I/O | `shared/loanRules.ts`, `shared/loan.ts` | `validateLoanInput`, `decideLoan`, `calculateMonthlyPayment` and the types. Imported by server and UI alike, so both apply identical rules. |
| JSON file store | `node:fs/promises` | `server/loanStore.ts` | Reads and rewrites `server/data/loans.json`; seeds it when missing; atomic writes; serialized updates (REF-020). |
| Logging | pino | `server/logger.ts` | JSON lines to stdout and `logs/app.log`; a child logger with a `reqId` per request; the `request completed` line (OPS-060). |

Two helpers complete the picture: `server/errors.ts` (`HttpError`, the `/api` 404 handler, the error mapper) and `server/config.ts` (defaults and environment overrides, REF-030). Tredgate Core Banking, KYC Desk and the Decision Register have **no** integration with Tredgate Loan; information moves between them only through people.

## Request flow: create an application

The path of a new application from the form to the data file, with the file responsible for each step:

```
Officer completes "New Loan Application" and clicks Create Application
  │
  ▼
src/components/LoanForm.vue        client pre-checks (name present, amount and term > 0, rate not negative)
  │  createLoanApplication(input)
  ▼
src/services/loanService.ts        fetch POST /api/loans, JSON body {applicantName, amount, termMonths, interestRate}
  │
  ▼  development only: Vite proxy 5173 -> 3000
server/logger.ts  requestLogger    new reqId (8 hex chars), timer started
server/app.ts     express.json()   body parsed; malformed JSON -> 400
server/app.ts     POST /api/loans  -> loans.create(req.body)
  │
  ▼
server/loanService.ts  create()
  ├─ shared/loanRules.ts validateLoanInput()   fails -> LoanValidationError -> 400 with message
  └─ server/loanStore.ts update()
        read loans.json -> append {id, applicantName (trimmed), amount, termMonths,
        interestRate, status: "pending", createdAt} -> write loans.json.tmp -> rename
  │
  ▼
server/app.ts     log "loan created" {loanId, amount, termMonths}; respond 201 with the record
server/logger.ts  on response finish: log "request completed" {method, url, status: 201, durationMs}
  │
  ▼
LoanForm.vue emits "created" -> src/App.vue refreshLoans() -> GET /api/loans -> table and summary re-render
```

Two properties matter operationally. Validation happens on the server even though the form pre-checks, so any other client (a script, curl) is held to the same rules (KI-003, KI-004). And the UI never trusts its own copy: after every write it reloads the list, so officers always see what the file contains.

## Request flow: auto-decide

The automated decision is the shortest path in the system and takes no user input beyond the click:

```
Officer clicks the lightning-bolt button on a pending row
  │
  ▼
src/components/LoanList.vue        emit("autoDecide", loan.id)
src/App.vue                        handleAutoDecide -> autoDecideLoan(id)
src/services/loanService.ts        fetch POST /api/loans/:id/auto-decide (no body)
  │
  ▼
server/logger.ts  requestLogger    reqId assigned
server/app.ts     POST /api/loans/:id/auto-decide -> loans.autoDecide(id)
  │
  ▼
server/loanService.ts  autoDecide()  inside one store.update():
  ├─ findPendingLoan(loans, id)      unknown id -> 404; status not pending -> 409
  ├─ shared/loanRules.ts decideLoan({amount, termMonths})
  │        amount <= 100000 && termMonths <= 60 -> "approved", otherwise "rejected"
  └─ loan.status = result -> write loans.json.tmp -> rename
  │
  ▼
server/app.ts     log "loan auto-decided" {loanId, status}; respond 200 with the record
server/logger.ts  log "request completed" {status: 200}
  │
  ▼
src/App.vue refreshLoans() -> the row shows its final badge and a dash instead of buttons
```

The manual decision (`PATCH /api/loans/:id/status`) follows the same path with two differences: the route first checks that `status` is `approved` or `rejected` (else 400), and `updateStatus` assigns that value instead of calling `decideLoan`. Lookup, the 404/409 guard, the write and the logging are shared.

## Folder layout

One line per file. Generated paths are marked; they are not part of the repository (REF-030).

```
shared/
  loan.ts                 LoanApplication, CreateLoanInput and LoanStatus types
  loanRules.ts            validateLoanInput, decideLoan, calculateMonthlyPayment, LoanValidationError, limits
server/
  index.ts                Entry point: builds logger, store and app; ensures the data file exists; listens or logs a startup failure
  app.ts                  Express app: middleware order, the five routes, /api 404, static dist/, error handler
  config.ts               PORT, DATA_FILE, LOG_FILE, LOG_LEVEL with defaults; seed and dist paths
  loanService.ts          list/create/updateStatus/autoDecide; findPendingLoan guard; generateId
  loanStore.ts            read (seed when missing), update (serialized), save (tmp + rename), reset
  logger.ts               createLogger (stdout + file), requestLogger (reqId child, "request completed")
  errors.ts               HttpError, notFoundHandler, errorHandler (4xx warn / 5xx error)
  reset.ts                Script behind npm run data:reset
  data/
    loans.seed.json       Committed seed, six applications ln-1001..ln-1006
    loans.json            (generated) live data file
    loans.json.tmp        (generated, transient) atomic-write staging file
src/
  main.ts                 Mounts the Vue app
  App.vue                 Loads the list, wires approve/reject/auto-decide, error banner with Retry
  assets/main.css         Global styles
  components/
    LoanForm.vue          New-application form with client pre-checks
    LoanList.vue          Table, installment via calculateMonthlyPayment, decision buttons
    LoanSummary.vue       Counters: total, pending, approved, rejected, total approved amount
  services/
    loanService.ts        API client: getLoans, createLoanApplication, updateLoanStatus, autoDecideLoan
tests/
  loanRules.test.ts       Unit tests of the shared rules
  api.test.ts             HTTP tests against a temporary data file and a silent logger
logs/app.log              (generated) JSON-lines log
dist/                     (generated) built UI for single-process mode
```

At the root: `package.json`, `vite.config.ts` (proxy), `vitest.config.ts`, `eslint.config.js`, the `tsconfig*.json` projects for UI, Vite config and server, and `.github/workflows/ci.yml` (REF-050).

## Where each policy rule lives in code

Every rule the system enforces has exactly one home. Rules the system does **not** enforce are listed too, so nobody searches the code for them.

| Rule | Policy | Implementation |
|---|---|---|
| Well-formed application data: a JSON object body, non-empty name, amount a number > 0, term a whole number > 0, rate a number in 0..1 | POL-020 | `validateLoanInput` in `shared/loanRules.ts`, called by `create` in `server/loanService.ts` before anything is written |
| Standard risk envelope: approve when amount <= 100,000 and term <= 60, else reject | POL-040 | `decideLoan` with `AUTO_APPROVE_MAX_AMOUNT` and `AUTO_APPROVE_MAX_TERM_MONTHS` in `shared/loanRules.ts`, called by `autoDecide` in `server/loanService.ts` |
| Flat-rate installment: amount x (1 + rate) / term | POL-030 | `calculateMonthlyPayment` in `shared/loanRules.ts`, called only by `src/components/LoanList.vue` |
| Decisions are final | POL-050, OPS-020 | `findPendingLoan` in `server/loanService.ts`: 404 for unknown id, 409 for a decided application |
| No personal data in logs | POL-070 | The domain log calls in `server/app.ts` pass `loanId`, `amount`, `termMonths` and `status` only |
| Product range, approval authority by amount, rate bands A to E | POL-020, POL-050, POL-030 | Not in code; applied by officers and evidenced in the Decision Register |

Changing a policy number means changing one constant or function in `shared/loanRules.ts` and its test in `tests/loanRules.test.ts` under OPS-050; the UI needs no change because it imports the same module.

## Error handling flow

All failures end in one place, `errorHandler` in `server/errors.ts`, which decides status, body and log level. Express 5 forwards thrown errors and rejected promises from route handlers to it, so routes and services simply throw.

```
thrown value                              status   response body                         log
──────────────────────────────────────    ──────   ───────────────────────────────────   ──────────────────────────────────────
HttpError(400|404|409, message)           as set   {"error": message}                    warn  "request rejected" {status, reason}
LoanValidationError(message)              400      {"error": message}                    warn  "request rejected"
body-parser error (numeric .status)       as set   {"error": parser message}             warn  "request rejected"
anything else (TypeError, SyntaxError,    500      {"error": "Internal server error"}    error "request failed with an unexpected
  file-system error ...)                                                                       error" {err: type, message, stack}
```

Who throws what: `validateLoanInput` (shared) throws `LoanValidationError`, also for a missing or non-object body (KI-004); `findPendingLoan` and the PATCH route throw `HttpError` with 404, 409 or 400; `notFoundHandler`, mounted on `/api` after the routes, throws `HttpError(404, "Route <METHOD> <url> not found")`; everything else, notably `JSON.parse` failing on a corrupted data file, becomes a 500.

The 500 branch never reveals the message to the client; the full `err` with stack trace goes to the log only, where RB-007 starts. The UI shows the `error` text it receives, prefixed with `Failed to load loan applications:` or `Action failed:`, in the red banner with a Retry button (RB-005).

## Request logging flow

Logging is set up once in `server/index.ts` and applied to every request by the first middleware in `server/app.ts`.

1. **Logger creation.** `createLogger(logFile, level)` in `server/logger.ts` builds a pino logger with ISO 8601 timestamps writing each line to stdout and to the log file (folder created on demand, synchronous writes).
2. **Startup line.** `server/index.ts` reads the store once so the data file exists, then logs `Tredgate Loan API started` with `port`, `dataFile`, `logFile` and `servingFrontend` once the port is bound. If the port is busy it logs `Tredgate Loan API failed to start` at level 50 with `err` and `port` and exits with code 1 (RB-004).
3. **Per-request child.** `requestLogger` runs before body parsing. It creates `req.log = logger.child({ reqId })`, where `reqId` is the first 8 characters of a random UUID, and notes the start time.
4. **Domain events.** Routes log through `req.log`, so `loan created`, `loan status updated` and `loan auto-decided` automatically carry the `reqId`.
5. **Rejections and failures.** `errorHandler` logs through the same `req.log`: `request rejected` (warn) for 4xx, `request failed with an unexpected error` (error) for 5xx.
6. **Completion.** When the response finishes, `requestLogger` writes `request completed` with `method`, `url`, `status` and `durationMs`, for every request.

Every line has `level`, `time`, `pid`, `hostname`, `msg` and, except the startup lines, `reqId`; correlating a request means filtering on its `reqId` (RB-002). `LOG_LEVEL` applies to both destinations (REF-030).

## Design constraints

The architecture is intentionally minimal for a branch workstation. These constraints are decisions, not omissions, and any change to them goes through OPS-050.

- **Single instance per data file.** Update serialization lives inside one process. Two processes on the same `DATA_FILE` can lose each other's writes; scale by giving each branch its own port and file (REF-030), never by starting a second copy.
- **No database.** The data file is rewritten on every change and read on every list; fine for thousands of applications, not for hundreds of thousands.
- **No authentication.** Anyone with network access to the port can act, so the port stays local to the workstation. Who may approve what is enforced by procedure and the Decision Register (POL-050); the log records `loanId` and outcome, not the person.
- **No background work.** No schedulers, queues or timers; nothing happens unless a request arrives.
- **Synchronous file logging.** Each log line reaches disk before the request continues, so the log is complete after a crash.
