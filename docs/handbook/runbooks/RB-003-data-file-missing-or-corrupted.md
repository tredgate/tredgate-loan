---
id: RB-003
title: Data File Missing or Corrupted
section: Runbooks
tags: [data-file, loans.json, corruption, syntaxerror, 500, seed, data-reset, backup, ki-001]
updated: 2026-09-27
---

# RB-003 Data File Missing or Corrupted

## Symptoms

A corrupted data file shows itself as a total outage of everything that touches loan applications, while the process itself stays up:

- The UI shows the red banner "Failed to load loan applications: Internal server error" with an empty table; the Retry button brings the banner back immediately.
- Every request to `GET /api/loans`, `POST /api/loans`, `PATCH /api/loans/:id/status` and `POST /api/loans/:id/auto-decide` returns `500` with `{"error":"Internal server error"}`.
- `GET /api/health` still returns `200 {"status":"ok","uptimeSeconds":<n>}`, because the health check does not read the data file. A green health check does not rule out this problem.
- The log (RB-002) contains one level 50 line per failed request with `"msg":"request failed with an unexpected error"` and `err.type` `SyntaxError`. The message depends on the damage: `Unexpected end of JSON input` (the file is empty, the signature of KI-001), `Unterminated string in JSON at position 300 (line 15 column 8)` (cut off in the middle) or `Unexpected token 'g', "garbage{" is not valid JSON` (foreign content). The stack always points to the `JSON.parse` call in the store: `at Object.read (/opt/tredgate-loan/server/loanStore.ts:29:19)`.

A missing file produces no error: the store silently recreates it from the seed and the UI shows the six seed applications instead of the branch's data. "Only the six standard applications are there" is therefore also a reason to open this runbook.

## When to use this runbook

Use this runbook when the symptoms above are present, or when `server/data/loans.json` was edited, moved, deleted or restored by hand or by a backup or antivirus tool.

The store's behavior in version 1.1 determines the procedure:

- Nothing is cached in memory. Every request reads the file, and every write reads, changes and saves it in one serialized step, so a repaired file takes effect on the next request without a restart.
- A missing file (`ENOENT`) is recreated from `server/data/loans.seed.json` automatically and silently; no log line records it.
- A corrupted file is never repaired or replaced automatically, because a file with content may still be salvageable and overwriting it would destroy evidence and data.
- Writes go to `loans.json.tmp` and are renamed over the data file, so a write interrupted by Ctrl+C or a crash leaves either the old or the new complete file, never a half-written one (fixed in 1.1.0, KI-001).

Do not use this runbook for a 500 whose log line shows a `TypeError` or any other non-`SyntaxError`; that is a code defect and belongs to RB-007. If the process is not running, start with RB-001.

## Prerequisites

- Severity per OPS-040: a branch that cannot list or decide applications during business hours is an S1 (respond within 15 minutes, update every 30 minutes). Notify the on-call Platform Engineer and the Operations Lead before changing any file.
- Terminal access and read/write permission on the `server/data` folder.
- The location of the latest backup of `loans.json` (OPS-030 requires an end-of-day copy; POL-070 defines retention).
- Operations Lead approval if the resolution ends in `npm run data:reset`, because a reset removes every application created since the seed and the branch must re-enter them from the Decision Register and paper records (RB-006).
- Officers told to stop entering decisions until the file is verified.

## Diagnosis

1. Confirm the pattern: health works, data does not.

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health
   curl -s -w '\n%{http_code}\n' http://localhost:3000/api/loans
   ```

   Expect `200`, then `{"error":"Internal server error"}` and `500`.

2. Confirm the log signature.

   ```bash
   grep '"level":50' logs/app.log | tail -n 3
   ```

   Expect `"type":"SyntaxError"` and a stack frame in `server/loanStore.ts`. Any other `err.type` means RB-007.

3. Find the data file in use: `grep 'Tredgate Loan API started' logs/app.log | tail -n 1` and read `dataFile`. Default: `<repository>/server/data/loans.json`. Use that path below.

4. Inspect the folder.

   ```bash
   ls -la server/data/
   ```

   Expect `loans.seed.json` (1,250 bytes, committed) and `loans.json`. A `loans.json` of 0 bytes explains `Unexpected end of JSON input`. A leftover `loans.json.tmp` may hold the last complete write; keep it.

5. Validate the JSON.

   ```bash
   node -e 'JSON.parse(require("fs").readFileSync("server/data/loans.json","utf8")); console.log("valid JSON")'
   ```

   A healthy file prints `valid JSON`. A corrupted file prints a `SyntaxError` with the position and exits with code 1. Run the same command against `loans.json.tmp` if it exists.

6. Look at the damage with `head -c 400 server/data/loans.json` and `tail -c 300 server/data/loans.json` and record what you see (empty, cut off, foreign content) in the incident note.

## Resolution

1. Back up the corrupted file before touching it; never delete it, because Compliance may need it (POL-070) and it may be salvageable.

   ```bash
   mkdir -p ~/tredgate-backups
   cp server/data/loans.json ~/tredgate-backups/loans-corrupted-$(date +%Y%m%d-%H%M%S).json
   cp server/data/loans.json.tmp ~/tredgate-backups/loans-tmp-$(date +%Y%m%d-%H%M%S).json 2>/dev/null
   ```

2. Choose the source of truth, in this order:
   - A `loans.json.tmp` that validates and is newer than the last backup: it is the last complete write. Copy it over the data file.
   - The most recent backup that validates: copy it over the data file. Applications created after the backup must be re-entered.
   - The corrupted file itself, if only the closing `]` or one trailing record is damaged: a Platform Engineer repairs a copy in a text editor, validates it and copies it into place.
   - No usable copy: with Operations Lead approval, restore the seed.

     ```bash
     npm run data:reset
     ```

     Expected output: `Loan data reset from seed: /opt/tredgate-loan/server/data/loans.json`. If the server runs with a DATA_FILE override, run the reset with the same `DATA_FILE=...` prefix, otherwise the wrong file is reset.

3. Validate the file now in place; it must print `valid JSON`.

4. Do not restart. The store reads the file on the next request, so the fix is live immediately.

5. Ask the Operations Lead to reconcile the list with the Decision Register and re-enter missing applications as new ones (they receive new ids; note the mapping in the incident record).

6. Record the incident per OPS-040 with the log signature, the kind of damage and the source of truth used.

## Verification

1. The API lists applications again:

   ```bash
   curl -s -w '\n%{http_code}\n' http://localhost:3000/api/loans
   ```

   Expect a JSON array and `200`. After a reset it has exactly six entries, `ln-1001` to `ln-1006` (RB-006); after a restore it has the branch's records.

2. Click Retry in the red banner. The banner disappears and the table and summary tiles fill without a page reload.

3. `tail -n 5 logs/app.log` shows `request completed` lines for `/api/loans` with `"status":200` after the last level 50 line, and no new level 50 lines.

4. A write works and the file stays valid: create a test application with `curl -X POST http://localhost:3000/api/loans -H "Content-Type: application/json" -d '{"applicantName":"Recovery Check","amount":1000,"termMonths":6,"interestRate":0.05}'`, expect `201`, validate the file again (`valid JSON`), then reject it.

5. `ls -la server/data/` shows no leftover `loans.json.tmp`, and the file size is plausible (about 200 bytes per application).

## Prevention

- Version 1.1.0 writes atomically and serializes updates, which removed the cause of KI-001; corruption during normal operation, including Ctrl+C at any moment, should no longer occur. If it does, treat it as a new defect (RB-007).
- Never edit `server/data/loans.json` by hand, and never while the process runs. Hand edits are the most likely remaining cause of a `SyntaxError`.
- Keep `server/data` out of cloud synchronization, antivirus quarantine and disk cleanup tools, which can replace the file with an older or partial copy without any log entry.
- Take the end-of-day backup required by OPS-030 and keep it per POL-070. It is the difference between a five-minute recovery and re-entering a week of applications.
- Watch for level 50 lines during the day (OPS-060); one `SyntaxError` line is enough to know the file is damaged.

## Related documents

- KI-001 Data File Truncated on Shutdown: the 1.1.0-beta incident behind `Unexpected end of JSON input` and its fix.
- RB-006 Resetting and Seeding Data: what `npm run data:reset` does and the six seed records.
- RB-002 Reading the Application Log: reading the level 50 line and `err.stack`.
- RB-007 Investigating a 500 Error: 500s that are not a `SyntaxError` from the store.
- REF-020 Data Model: structure of an application record.
- REF-030 Configuration and Environment: the DATA_FILE variable.
- OPS-040 Incident Management: severity S1 and postmortems.
- OPS-030 Daily Operations Checklist and POL-070 Compliance, KYC and Data Handling: backups and retention.
