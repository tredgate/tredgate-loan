---
id: KI-001
title: Data File Truncated on Shutdown
section: Known Issues
tags: [data-file, corruption, 500, atomic-write, shutdown, loan-store]
updated: 2026-09-27
status: resolved
fixed_in: 1.1.0
---

# KI-001 Data File Truncated on Shutdown

## Summary

In release 1.1.0-beta the data file `server/data/loans.json` was rewritten in place on every change. When the process was stopped during a write, the file was left empty or cut off. After the restart every request that touched the data returned 500 and the UI showed only an error banner. The pilot branch lost the use of Tredgate Loan for 40 minutes on 2026-08-26 (S1). Fixed in 1.1.0 by writing to a temporary file and renaming it into place.

## Symptoms

- The UI shows the red banner `Failed to load loan applications: Internal server error`; Retry does not help.
- `GET /api/loans`, create and decide all return `500 {"error":"Internal server error"}`.
- `GET /api/health` still returns `200`, because it does not read the data file.
- `server/data/loans.json` is 0 bytes or ends in the middle of a record.

## Log signature

Level 50 lines with `err.type` `SyntaxError` and a stack through `JSON.parse` and `loanStore.ts`, one per failed request, each followed by a `request completed` line with status 500:

```json
{"level":50,"time":"2026-08-26T06:41:12.208Z","pid":7715,"hostname":"branch-ws-07","reqId":"3b9e0c1a","err":{"type":"SyntaxError","message":"Unexpected end of JSON input","stack":"SyntaxError: Unexpected end of JSON input\n    at JSON.parse (<anonymous>)\n    at Object.read (/opt/tredgate-loan/server/loanStore.ts:29:19)"},"msg":"request failed with an unexpected error"}
{"level":30,"time":"2026-08-26T06:41:12.209Z","pid":7715,"hostname":"branch-ws-07","reqId":"3b9e0c1a","method":"GET","url":"/api/loans","status":500,"durationMs":2,"msg":"request completed"}
```

An empty file gives `Unexpected end of JSON input`; a partially written one gives `Expected double-quoted property name in JSON at position N`. Find them with `grep '"type":"SyntaxError"' logs/app.log`.

## Root cause

The beta `save()` in `server/loanStore.ts` was a single call:

```ts
await writeFile(filePath, JSON.stringify(loans, null, 2))
```

`writeFile` opens the target for writing, which truncates it to zero bytes, then writes the content. A process stopped between these steps leaves an empty file; one stopped mid-write leaves a truncated file. The store's `read()` treated only a **missing** file (`ENOENT`) as a reason to copy the seed, so an empty file was not repaired: `JSON.parse('')` threw, the error reached the error handler untyped and became a 500 for every data request. Overlapping updates were also uncoordinated, so simultaneous decisions could overwrite each other.

## Fix

Release 1.1.0 changed `server/loanStore.ts` in two ways. `save()` writes the full content to `loans.json.tmp` and then calls `rename()` to move it over `loans.json`, a single file-system operation, so the data file is always either the old or the new complete version. `update()` chains every read-mutate-save through a promise chain, so writes run one at a time. `npm run data:reset` (`server/reset.ts`) was added for recovery, and runbook RB-003 was written.

## Workaround

On a workstation still running 1.1.0-beta: stop the server (RB-001), restore `server/data/loans.json` from the most recent dated copy, and restart. Without a copy, delete the damaged file; the seed is copied in at the next start, and applications created since must be re-entered from the Decision Register and branch paperwork. Never edit the file while the server runs.

## Prevention

- Atomic writes and serialized updates in every release from 1.1.0 (REF-020).
- Stop Tredgate Loan only through RB-001, never by powering off a running workstation.
- Keep a dated copy of the data file as part of the daily routine (OPS-030).

## Related documents

RB-003 Data File Missing or Corrupted; RB-001 Starting and Stopping Tredgate Loan; RB-007 Investigating a 500 Error; REF-020 Data Model; OPS-040 Incident Management; changelog 1.1.0.

## Timeline

- 2026-08-10: 1.1.0-beta released to the pilot branch.
- 2026-08-26 06:40: workstation restarted after an overnight update; all data requests return 500; S1 raised at 06:48.
- 2026-08-26 06:55: on-call Platform Engineer finds `loans.json` at 0 bytes and the `SyntaxError` lines.
- 2026-08-26 07:20: file restored from the previous evening's copy; two applications re-entered. Incident closed.
- 2026-08-27: cause reproduced by stopping the process during a write.
- 2026-09-04: fix merged with the temporary-file write and serialized updates.
- 2026-09-15: release 1.1.0; postmortem closed (OPS-040).
