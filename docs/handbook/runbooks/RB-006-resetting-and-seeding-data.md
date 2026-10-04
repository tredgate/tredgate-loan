---
id: RB-006
title: Resetting and Seeding Data
section: Runbooks
tags: [data-reset, seed, loans.seed.json, loans.json, backup, retention, operations-lead-approval]
updated: 2026-09-27
---

# RB-006 Resetting and Seeding Data

## Symptoms

This runbook is a controlled procedure, not a fault response. It is opened when one of these situations applies:

- A new or rebuilt branch workstation must start with the standard six sample applications so that officers can verify the installation before entering real applications.
- RB-003 ended without a usable backup and the Operations Lead has approved restoring the seed as the last resort.
- A non-production workstation used for release verification (OPS-050) must return to a known state before each test run.
- The UI shows exactly six applications, `ln-1001` to `ln-1006`, although the branch has entered many more: the data file went missing and was recreated from the seed automatically. The branch's data must then be restored from backup, not reset again.

The seed lives in `server/data/loans.seed.json` (committed, 1,250 bytes). The live data file `server/data/loans.json` is not committed and is recreated from the seed when missing.

## When to use this runbook

A reset replaces the live data file with the seed and permanently removes every application the branch has recorded. It is allowed only when all of the following hold:

1. The Operations Lead has approved the reset in writing (ticket or e-mail), naming the workstation and the reason.
2. The reset happens at end of day or at another time when no officer is entering or deciding applications.
3. A timestamped backup of the current `server/data/loans.json` has been stored per the retention rules in POL-070; a reset without a retained copy is a compliance breach even on a workstation about to be rebuilt.
4. Pending applications have been checked against the 2-business-day decision deadline (OPS-020): a pending application removed by the reset must be decided before or re-entered afterwards.

Legitimate uses: initial installation, release verification on non-production workstations, and the last-resort recovery in RB-003. Never reset to "clean up" a workstation with real applications or to undo a decision; decisions are final (POL-050) and a wrongly decided application is replaced by a new one.

## Prerequisites

- Written Operations Lead approval as described in "When to use this runbook".
- Terminal access in the repository root and Node.js 22.19 or newer.
- The data file path in use. The default is `server/data/loans.json`. If the server runs with a DATA_FILE override (the `dataFile` field of the `Tredgate Loan API started` log line), the reset must be run with the same `DATA_FILE` value, otherwise it resets a different file than the one the server uses.
- A backup location outside the repository folder, for example `~/tredgate-backups/`.
- The UI closed on all browsers at the branch, or officers informed that they must reload afterwards.
- The seed content, to recognize a correct result:

| id | Applicant | Amount (USD) | Term (months) | Rate | Status |
|---|---|---|---|---|---|
| ln-1001 | Amara Ndlovu | 25,000 | 24 | 0.08 | approved |
| ln-1002 | Thabo Mokoena | 120,000 | 72 | 0.07 | rejected |
| ln-1003 | Jana Nováková | 60,000 | 48 | 0.09 | pending |
| ln-1004 | Sipho Dlamini | 100,000 | 60 | 0.085 | pending |
| ln-1005 | Petra Svobodová | 8,000 | 12 | 0.05 | approved |
| ln-1006 | Lerato Khumalo | 45,000 | 36 | 0.075 | pending |

The seed exercises the policy: ln-1004 sits exactly on both auto-decide limits and is approved by auto-decide (POL-040); ln-1002 is outside the standard risk envelope.

## Diagnosis

Before resetting, establish what will be lost and where the reset will act.

1. Locate the data file the running server uses:

   ```bash
   grep 'Tredgate Loan API started' logs/app.log | tail -n 1
   ```

   Read `dataFile` and use that path below if it differs from `server/data/loans.json`.

2. Count the current applications and the pending ones:

   ```bash
   curl -s http://localhost:3000/api/loans | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const a=JSON.parse(d);console.log(a.length+" applications, pending: "+a.filter(l=>l.status==="pending").length)})'
   ```

   Expect a line such as `23 applications, pending: 4`. Every pending application must be handled per OPS-020. If the server is not running, use `ls -la server/data/` and the validation command from RB-003.

3. Confirm the seed is intact:

   ```bash
   node -e 'const s=require("./server/data/loans.seed.json");console.log(s.length, s.map(l=>l.id).join(","))'
   ```

   Expect `6 ln-1001,ln-1002,ln-1003,ln-1004,ln-1005,ln-1006`. Anything else means the seed was modified; stop and involve Platform Engineering, because the seed is part of the release.

4. Check for a stale `server/data/loans.json.tmp`. It exists only during a write. If one is present while no request runs, keep a copy with the backup; it may hold the last complete write.

## Resolution

1. Back up the live file with a timestamp and keep it per POL-070.

   ```bash
   mkdir -p ~/tredgate-backups
   cp server/data/loans.json ~/tredgate-backups/loans-$(date +%Y%m%d-%H%M%S).json
   ```

   Windows PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force ~/tredgate-backups | Out-Null
   Copy-Item server/data/loans.json ("~/tredgate-backups/loans-{0}.json" -f (Get-Date -Format yyyyMMdd-HHmmss))
   ```

2. Validate the backup: `node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log("valid JSON")' ~/tredgate-backups/loans-<timestamp>.json`. A backup of a corrupted file is still worth keeping, but you must know it is corrupted.

3. Run the reset from the repository root:

   ```bash
   npm run data:reset
   ```

   Expected output ends with the absolute path of the file that was replaced:

   ```text
   > tredgate-loan@0.0.0 data:reset
   > tsx server/reset.ts

   Loan data reset from seed: /opt/tredgate-loan/server/data/loans.json
   ```

   With an override: `DATA_FILE=/path/to/loans.json npm run data:reset`; the output must show that same path.

4. The server may keep running: nothing is cached, every request reads the data file, so the next `GET /api/loans` returns the six seed applications without a restart. Because the reset copies the seed directly over the live file (without the temporary-file-and-rename step of normal writes), run it only when no requests are in flight, which the end-of-day condition guarantees. The reset writes nothing to `logs/app.log`; note its time in the operations log by hand.

5. Tell officers to reload the UI. Open pages still show the old rows and produce "Action failed: Loan with id <id> not found" on the next decision.

6. Record the reset (approver, workstation, backup file name, number of applications removed) in the operations log and, if part of an incident, in the incident record (OPS-040).

## Verification

1. The API returns exactly the seed:

   ```bash
   curl -s http://localhost:3000/api/loans | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{for (const l of JSON.parse(d)) console.log(l.id,l.status,l.amount,l.termMonths,l.interestRate)})'
   ```

   Expect six lines from `ln-1001 approved 25000 24 0.08` to `ln-1006 pending 45000 36 0.075`.

2. The UI summary tiles read Total Applications 6, Pending 3, Approved 2, Rejected 1, Total Approved $33,000 (25,000 + 8,000).

3. The Monthly Payment column shows the flat-rate installments of POL-030: ln-1001 $1,125.00; ln-1002 $1,783.33; ln-1003 $1,362.50; ln-1004 $1,808.33; ln-1005 $700.00; ln-1006 $1,343.75. A different figure means the seed was altered.

4. `cmp server/data/loans.seed.json server/data/loans.json` prints nothing (identical files) until the first write.

5. `logs/app.log` has a `request completed` line for `GET /api/loans` with status 200 after the reset, and no level 50 lines.

6. The backup file exists, validates as JSON and carries today's timestamp in its name.

## Prevention

- Treat the reset as a privileged operation: only the Operations Lead approves it and only Platform Engineers and Operations Leads run it (OPS-010).
- Take the end-of-day backup (OPS-030) every day, not only before a reset. It is the only way to recover a branch's applications when the data file is lost, because a missing file is silently replaced by the seed.
- Keep timestamped backups outside the repository folder, where releases never touch them.
- Never edit `server/data/loans.seed.json`; it is part of the release and the verification figures depend on it.
- Always run the reset with the same DATA_FILE value as the server, or with none if the server uses the default.

## Related documents

- RB-003 Data File Missing or Corrupted: when a reset is the last-resort recovery.
- RB-005 Frontend Shows "Failed to load loan applications": the "not found" banner after a reset.
- REF-020 Data Model: structure of an application record and the seed ids.
- REF-030 Configuration and Environment: the DATA_FILE variable and how overrides are recorded.
- POL-070 Compliance, KYC and Data Handling: retention of application data and backups.
- POL-040 Automated Decisioning and POL-030 Interest Rates and Installments: the figures used in verification.
- OPS-020 Application Lifecycle and SLAs: pending applications and the 2-business-day deadline.
- OPS-030 Daily Operations Checklist: the end-of-day backup.
