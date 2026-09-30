---
id: RB-005
title: Frontend Shows "Failed to load loan applications"
section: Runbooks
tags: [frontend, error-banner, retry, vite-proxy, econnrefused, health-check, action-failed]
updated: 2026-09-27
---

# RB-005 Frontend Shows "Failed to load loan applications"

## Symptoms

The Tredgate Loan UI shows a red banner under the header with a Retry button. The text starts with one of two prefixes, followed by the message the API client received:

| Banner text | Meaning |
|---|---|
| `Failed to load loan applications: Request failed with status 500` | Development mode: the Vite proxy could not connect to port 3000 and answered 500 with an empty body. |
| `Failed to load loan applications: Internal server error` | The API runs but `GET /api/loans` failed (level 50 line in the log): corrupted data file (RB-003) or another defect (RB-007). |
| `Failed to load loan applications: Failed to fetch` (wording varies by browser) | The browser could not connect: the Vite dev server or the single process is down. |
| `Failed to load loan applications: Request failed with status 404` | Something other than Tredgate Loan answers on the port (RB-004). |
| `Action failed: Loan with id ln-1003 has already been decided (approved)` | A decision button was used on an application decided meanwhile (409). Not an outage. |
| `Action failed: Loan with id <id> not found` | The application was removed, typically by a data reset while the page was open (RB-006). |
| `Action failed: Internal server error` | A decision request returned 500 (RB-007). |

When loading fails, the tiles show zeros and the table is empty; after a failed action the previous data stays visible. Validation messages inside the New Loan Application form are not this symptom; see RB-008.

## When to use this runbook

Use this runbook whenever an officer reports the red banner, whether it begins with "Failed to load loan applications" or "Action failed". It walks from the browser back to the API and identifies one of four causes: API not running or exited, corrupted data file, or the UI talking to the wrong port.

The request path explains the messages. In development mode the UI calls the Vite dev server on 5173, which forwards `/api` to the Express API on 3000 and, when the API is unreachable, answers `500` with an empty body and prints `[vite] http proxy error: /api/loans`; in single-process mode the UI calls port 3000 directly. The UI shows the `error` field of a JSON error body, or `Request failed with status <code>` when the body is not JSON.

Only "Internal server error" and "Request failed with status" texts indicate a fault; "already been decided" and "not found" need only a Retry.

## Prerequisites

- Access to the workstation terminal(s): in development mode one terminal with `[dev:web]` and `[dev:api]` prefixed output, in single-process mode one terminal with the API output.
- `curl` and read access to `logs/app.log` (RB-002).
- The URL the officer uses: http://localhost:5173 (development mode) or http://localhost:3000 (single-process mode), or a port override recorded in REF-030.
- Severity per OPS-040: if no officer at the branch can load applications during business hours, this is an S1; notify the on-call Platform Engineer within 15 minutes. A single failing action with a workaround is S3.
- Ask the officer to keep the tab open; the Retry button is the verification step.

## Diagnosis

1. Check the API directly, bypassing any proxy:

   ```bash
   curl -s -i http://localhost:3000/api/health
   ```

   Expect `HTTP/1.1 200 OK` and `{"status":"ok","uptimeSeconds":<n>}`. `Connection refused` means no API process (step 4). A non-JSON answer means a foreign program (RB-004).

2. In development mode, check the path the browser uses:

   ```bash
   curl -s -i http://localhost:5173/api/health
   ```

   Expect the same JSON. `HTTP/1.1 500 Internal Server Error` with `Content-Type: text/plain` and no body means the proxy cannot reach port 3000, and `[dev:web]` shows:

   ```text
   11:16:19 PM [vite] http proxy error: /api/health
   AggregateError [ECONNREFUSED]:
       at internalConnectMultiple (node:net:1139:18)
   ```

3. If health works, check the request the banner reports:

   ```bash
   curl -s -w '\n%{http_code}\n' http://localhost:3000/api/loans
   ```

   `{"error":"Internal server error"}` and `500` next to a healthy health check points to the data file; confirm with `grep '"level":50' logs/app.log | tail -n 1`: `SyntaxError` means RB-003, anything else RB-007.

4. If the API does not answer, look at its terminal. A prompt means it exited: `RangeError [ERR_SOCKET_BAD_PORT]` or `Error: default level:...` is a configuration error (RB-001); a startup line followed by an immediate exit means the port was taken (RB-004).

5. Check `echo $PORT` (must be empty in development mode) and that the browser URL's port matches the mode.

| Direct health | Proxy health | GET /api/loans | Cause |
|---|---|---|---|
| refused | 500 empty | - | API not running or exited |
| 200 | 500 empty | - | PORT override; API not on 3000 |
| 200 | 200 | 500 JSON | Data file (RB-003) or code defect (RB-007) |
| 200 | 200 | 200 | Transient; verify with Retry |

## Resolution

1. **API not running or exited.** Start it per RB-001 and wait for the `Tredgate Loan API started` line. If it exits right after that line, free port 3000 per RB-004; if it exits with a configuration error, correct PORT or LOG_LEVEL and start again.

2. **API running but the proxy fails.** The API is not on port 3000. Restart it without the PORT override (`vite.config.ts` proxies to `http://localhost:3000`), or use single-process mode on the API's port, for example http://localhost:3001 after `PORT=3001 npm start`.

3. **Data file corrupted.** Follow RB-003 (back up, restore or reset). No restart is needed; the store reads the file on every request.

4. **Other 500.** Follow RB-007. Record the `reqId` from the level 50 line first.

5. **Foreign program on the port.** Stop it or move Tredgate Loan to another port per RB-004.

6. **Action failed with 409 or 404.** Nothing to repair: the application was decided by someone else or a double click (decisions are final, POL-050) or removed by a data reset (RB-006). Click Retry.

## Verification

1. Click Retry in the red banner rather than reloading the page. Retry calls `GET /api/loans` again and clears the error only when the call succeeds, so a vanished banner and a populated table prove the whole path (browser, proxy if any, API) works.

2. Confirm in the log that the retry arrived and succeeded:

   ```bash
   tail -n 3 logs/app.log
   ```

   Expect `{"level":30,...,"method":"GET","url":"/api/loans","status":200,...,"msg":"request completed"}` as the last line, with the `pid` of the process you expect to be serving.

3. Verify writes: create a test application, expect it as `pending`, then reject it; the log shows `loan created` and `loan status updated` with `"status":"rejected"` and no banner appears.

4. In development mode, `[dev:web]` shows no new `http proxy error` lines during these steps.

5. Record cause and fix in the incident record if the banner affected more than one officer or lasted longer than 15 minutes (OPS-040).

## Prevention

- Start the system with RB-001 every morning and verify the health check before officers begin; most banners are simply an API that was never started.
- Use single-process mode (`npm start`) on branch workstations. It removes the proxy and the second port, two of the four causes in this runbook.
- Train officers to read the banner: "already been decided" needs only a Retry; "Internal server error" needs a call to the Operations Lead with the time of the click (the `reqId` lookup in RB-002).
- Do not reset data (RB-006) while officers have the UI open; every open page then shows "Action failed: Loan with id ... not found" on the next decision.
- Keep the API terminal visible; an exited process is obvious when the prompt is on screen.

## Related documents

- RB-001 Starting and Stopping Tredgate Loan: bringing the API back and reading the startup line.
- RB-003 Data File Missing or Corrupted: "Internal server error" with a `SyntaxError` in the log.
- RB-004 Port Already in Use: stale instances and the fixed proxy target.
- RB-007 Investigating a 500 Error: any other "Internal server error".
- RB-008 Validation Errors (400) Reference: messages shown inside the form rather than in the banner.
- REF-040 Architecture Overview: the request path through Vite to Express.
- OPS-040 Incident Management: severity and notification rules.
- POL-050 Manual Decisions and Approval Authority: decisions are final, which explains 409.
