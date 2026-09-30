---
id: GLOSSARY
title: Glossary
section: Glossary
tags: [glossary, terms, definitions, business, technical]
updated: 2026-09-27
---

# Glossary

## How to use this glossary

This glossary defines the business and technical terms used across the Tredgate Loan handbook in one alphabetical list. Business terms come from the lending policy of Tredgate Financial Services and the way Lending Operations works the Simple Personal Loan process; technical terms describe the Tredgate Loan system as built in version 1.1. Each definition is one to three sentences and names the document that owns the topic: POL documents own policy, OPS documents own procedure, RB runbooks own troubleshooting, and REF documents own technical detail. Field names, commands, and messages are written exactly as the system shows them. Amounts are US dollars; interest rates are fractions (0.08, never 8%).

## Terms A to D

| Term | Definition |
|---|---|
| API | The HTTP interface under `/api`, JSON only: `GET /api/health`, `GET /api/loans`, `POST /api/loans`, `PATCH /api/loans/:id/status`, `POST /api/loans/:id/auto-decide`. See REF-010. |
| Application | A Simple Personal Loan request recorded with `applicantName`, `amount`, `termMonths`, `interestRate`, `status`, and `createdAt`. Disbursement happens in Tredgate Core Banking. |
| Approval authority | Procedural limits of POL-050: Loan Officer alone up to 50,000 USD; Senior Loan Officer from 50,000.01 to 100,000 USD; above 100,000 USD a Senior Loan Officer plus Credit Risk Analyst sign-off in the Decision Register (the four-eyes rule). Not enforced by the system. |
| Approved | Final status: the application goes to Tredgate Core Banking for disbursement and cannot be changed. |
| Atomic write | The data file is written to `loans.json.tmp` and renamed over `loans.json`, so it is never left half-written. Since 1.1.0; fixes KI-001. |
| Auto-decide | Automated decision under POL-040 (lightning-bolt button or `POST /api/loans/:id/auto-decide`): approved if amount is at most 100,000 USD and term at most 60 months, otherwise rejected. Immediate; never escalates. |
| Branch workstation | The single computer at a branch that runs Tredgate Loan and holds the only copy of the data file and log file; owned by the Operations Lead (OPS-010). |
| createdAt | ISO 8601 UTC timestamp set at creation, for example `2026-09-25T11:30:00.000Z`; it starts the SLA clock. |
| Credit Risk Analyst | Role in Credit Risk that owns lending policy, rate bands, and the standard risk envelope, and signs off approvals above 100,000 USD. |
| Data file | `server/data/loans.json`, a pretty-printed JSON array of every application. Created from the seed when missing; relocated with `DATA_FILE` (REF-020, RB-003). |
| Decision Register | A ledger outside Tredgate Loan where manual approval sign-offs are recorded. With no login in the system, the register is how approval authority is enforced. |

## Terms E to J

| Term | Definition |
|---|---|
| Environment variable | Optional runtime setting: `PORT` (3000), `DATA_FILE` (`server/data/loans.json`), `LOG_FILE` (`logs/app.log`), `LOG_LEVEL` (`info`, `debug`, `warn`, or `error`). See REF-030. |
| Express | The Node.js web framework serving the API on port 3000 and, after `npm start`, the built UI from the same port. |
| Flat-rate installment | SPL formula: total repayable = amount x (1 + interest rate); monthly installment = total / term months. 10,000 USD over 12 months at 0.10 gives 916.67 USD. Not amortized (POL-030). |
| Health endpoint | `GET /api/health`, returning `{"status":"ok","uptimeSeconds":<n>}` while the process runs. It never reads the data file. |
| HTTP 400 Bad Request | Response to invalid input, body `{"error":"<message>"}`, with one of the validation messages in RB-008 or the parser message for malformed JSON. |
| HTTP 404 Not Found | Response for an unknown application (`Loan with id <id> not found`) or unknown route (`Route GET /api/whatever not found`). |
| HTTP 409 Conflict | Response to approve, reject, or auto-decide on a non-pending application: `Loan with id <id> has already been decided (approved)` or `(rejected)`. This makes decisions final. |
| HTTP 500 Internal Server Error | Response `{"error":"Internal server error"}` to an unexpected failure such as a corrupted data file; the stack trace is only in the log (RB-007). |
| Incident | An unplanned event that prevents or degrades recording or deciding applications: S1 system down in business hours, S2 degraded, S3 minor with workaround, S4 cosmetic (OPS-040). |
| Interest rate | Annual rate stored as a fraction between 0 and 1 inclusive; 0.08 means 8% per year. Entering 8 is rejected since 1.1.0 (KI-002). |
| JSON lines | One JSON object per line, the format of `logs/app.log`; each line has `level`, `time`, `pid`, `hostname`, `reqId`, `msg`, and event fields (OPS-060). |

## Terms K to P

| Term | Definition |
|---|---|
| Known Issue | A register entry (KI-001, KI-002, KI-003) recording symptom, log signature, root cause, fix, and prevention. Every S1 and S2 incident produces one. |
| KYC Desk | The team and system outside Tredgate Loan that verifies an applicant's identity before the application is created. |
| Loan ID | The `id` of an application: seed records `ln-1001` to `ln-1006`; generated ids are a base36 timestamp plus random suffix, such as `muk5m5v2e3z5zkt`. Logged as `loanId`. |
| Loan Officer | Front-line role in Lending Operations that creates applications, decides up to 50,000 USD alone, and may reject any application. |
| Log level | Numeric severity of a log line: 30 info, 40 warn (expected rejections), 50 error (unexpected failures). |
| Node.js and npm | The JavaScript runtime (20.19 or newer required) and its command runner, used for every Tredgate Loan command from `npm install` to `npm run data:reset`. |
| On-call Platform Engineer | The Platform Engineering engineer reachable in branch business hours; responds to S1 within 15 minutes and S2 within 1 hour (OPS-040). |
| Operations Lead | Role in Lending Operations that owns the branch workstation, runs the daily checklist (OPS-030), declares incidents, and approves data resets. |
| Pending | The initial status and the only one in which approve, reject, and auto-decide are possible. Decided within 2 business days (OPS-020). |
| Personal data | Applicant names and anything else identifying a person: stored in the data file, never written to the log or quoted in incident reports (OPS-060, POL-070). |
| pino | The logging library writing JSON lines to standard output and the log file, with ISO timestamps and a per-request child logger carrying the `reqId`. |
| Product range | SPL policy limits: 1,000 to 250,000 USD and 6 to 84 months. Not enforced by the system; applications outside it are rejected manually (POL-020). |

## Terms R to Z

| Term | Definition |
|---|---|
| Rate band | One of five annual rates set by Credit Risk, as fractions: A 0.05, B 0.065, C 0.08, D 0.095, E 0.12 (POL-030). |
| Rejected | Final status: the applicant receives a rejection letter; a new application is needed to apply again. |
| reqId | An 8-character hexadecimal identifier on every log line of one HTTP request; it links a `loan created` or `request rejected` line to its `request completed` line (RB-002). |
| Seed | `server/data/loans.seed.json`, six sample applications `ln-1001` to `ln-1006`, copied to the data file when it is missing. `npm run data:reset` restores it and discards live data (RB-006). |
| Senior Loan Officer | Role with approval authority from 50,000.01 to 100,000 USD and co-signature above 100,000 USD; first escalation point for Loan Officers. |
| Simple Personal Loan (SPL) | Tredgate's consumer loan product in USD with a flat-rate installment; the only product handled by Tredgate Loan. |
| SLA | Service level agreement: a pending application is decided within 2 business days (Monday to Friday, excluding Tredgate holidays) of `createdAt`; auto-decide is immediate (OPS-020). |
| Standard risk envelope | The auto-decide limits of POL-040: amount at most 100,000 USD and term at most 60 months, both inclusive. |
| Tredgate Core Banking | The system outside Tredgate Loan that disburses approved loans and manages repayments and arrears (POL-060). |
| Tredgate Loan | The single-instance system (Vue UI, Express API, JSON data file, JSON lines log) recording SPL applications and decisions at a branch. Current version 1.1.0. |
| Vite | UI development server and build tool: `npm run dev` serves the UI on port 5173 and proxies `/api` to port 3000; `npm run build` produces the files `npm start` serves. |
