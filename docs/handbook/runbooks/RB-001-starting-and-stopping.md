---
id: RB-001
title: Starting and Stopping Tredgate Loan
section: Runbooks
tags: [startup, shutdown, npm-run-dev, npm-start, health-check, environment-variables, node-version]
updated: 2026-09-27
---

# RB-001 Starting and Stopping Tredgate Loan

## Symptoms

This runbook covers a planned action, but it is usually opened because of one of these observations on a branch workstation:

- The browser shows a connection error ("This site can't be reached") for http://localhost:5173 or http://localhost:3000: no Tredgate Loan process is listening.
- The UI shows the red banner "Failed to load loan applications: Request failed with status 500". In development mode this means the Vite dev server is up but the API on port 3000 is not (RB-005).
- `curl http://localhost:3000/api/health` prints "Connection refused" instead of `{"status":"ok","uptimeSeconds":<n>}`.
- The workstation was restarted, the terminal running Tredgate Loan was closed, or a release was installed per OPS-050.
- The daily checklist (OPS-030) requires a controlled start with a health check before the first application of the day.

If Tredgate Loan is running but misbehaving, use RB-003 (data file), RB-004 (port conflict) or RB-007 (500 errors) instead. A restart rarely fixes those and can hide evidence.

## When to use this runbook

Use this runbook whenever a Tredgate Loan process on a branch workstation must be started or stopped in a controlled way: the daily start and end-of-day stop (OPS-030); after a workstation restart or power interruption; after a release (OPS-050), when the old process is stopped and the new code is started; and as the final step of RB-003, RB-004 or RB-006 when they call for a restart.

Version 1.1 has two modes. Development mode (`npm run dev`) runs two processes: the Vite dev server on port 5173 serves the Vue UI and forwards every `/api` request to the Express API on port 3000. Single-process mode (`npm start`) builds the UI once and serves UI and API together from port 3000. Branch workstations normally run single-process mode; development mode is for engineers changing code. OPS-010 defines who may start and stop the system (Operations Lead or Platform Engineer).

## Prerequisites

- Node.js 22.19 or newer: `node --version` must print `v22.19.0` or higher (for example `v24.11.0`). `package.json` declares `engines: >=22.19`, but npm does not refuse an older version, so check manually.
- npm and a terminal open in the repository root, the folder that contains `package.json`.
- Dependencies installed with `npm install`, once after checkout and after every release that changed `package.json`. A missing `node_modules` folder is the most common cause of an immediate start failure.
- Port 3000 free and, in development mode, port 5173 free; otherwise follow RB-004 first.
- Write access to the repository folder, because the process creates `logs/app.log` and `server/data/loans.json`.
- Knowledge of any environment variable overrides used at this branch (PORT, DATA_FILE, LOG_FILE, LOG_LEVEL; see REF-030). All are optional; the defaults work without any configuration.

## Diagnosis

Confirm the current state before starting, so that you do not start a second instance on top of a running one.

1. Check the Node.js version.

   ```bash
   node --version
   ```

   Expect `v22.19.0` or newer; anything lower must be upgraded first.

2. Check whether an API already listens on port 3000.

   ```bash
   curl -s http://localhost:3000/api/health
   ```

   Nothing running: `curl: (7) Failed to connect to localhost port 3000 ... Connection refused`. Already running: `{"status":"ok","uptimeSeconds":5321}`. A large `uptimeSeconds` means an instance has run for hours; do not start another one (RB-004).

3. Check which process owns the port, if any.

   ```bash
   lsof -nP -i :3000
   ```

   On Windows: `netstat -ano | findstr :3000`. Expect no output when the port is free.

4. Check that dependencies are installed: `ls node_modules/.bin/tsx node_modules/.bin/vite`. If either file is missing, run `npm install`.

5. Read the last line of `logs/app.log` if it exists. There is no "stopped" message; the log ends with the previous run's last `request completed` line. A last line at level 50 means the previous run ended with a problem for RB-007.

## Resolution

**Development mode (engineers):**

1. Run `npm run dev` in the repository root.
2. Two prefixed outputs appear. `[dev:web]` shows Vite starting (`VITE v7.2.4  ready in 113 ms`, `Local: http://localhost:5173/`). `[dev:api]` shows the API startup line:

   ```json
   {"level":30,"time":"2026-09-27T07:58:25.679Z","pid":36067,"hostname":"branch-ws-07","port":3000,"dataFile":"/opt/tredgate-loan/server/data/loans.json","logFile":"/opt/tredgate-loan/logs/app.log","servingFrontend":false,"msg":"Tredgate Loan API started"}
   ```

3. Open http://localhost:5173.

**Single-process mode (branch workstations):**

1. Run `npm start`. It first runs `vue-tsc -b && vite build` (type check and UI build into `dist/`), which takes several seconds, then starts the API with `tsx server/index.ts`.
2. Wait for the `Tredgate Loan API started` line; here `servingFrontend` is `true`.
3. Open http://localhost:3000.

**Reading the startup line:** `port` is the listening port; `dataFile` and `logFile` are the absolute paths in use (check them whenever a DATA_FILE or LOG_FILE override is suspected); `servingFrontend` is `true` only when the built `dist/` folder exists; `pid` identifies the process for `lsof` and `kill`. With LOG_LEVEL `warn` or `error` the startup line is not printed, because it is an info-level message.

**Environment variables** are set on the command line for that start only:

```bash
PORT=3001 LOG_LEVEL=warn npm start                  # macOS, Linux
$env:PORT=3001; $env:LOG_LEVEL="warn"; npm start    # Windows PowerShell
```

`PORT` must be a number; `PORT=abc` aborts with `RangeError [ERR_SOCKET_BAD_PORT]`. `LOG_LEVEL` accepts `debug`, `info`, `warn` or `error`; any other value aborts with `Error: default level:<value> must be included in custom levels`. Do not set PORT in development mode: the Vite proxy is fixed to port 3000 (RB-004).

**Stop:** press Ctrl+C in the terminal that runs the process. In development mode `concurrently` forwards the signal to both processes and reports each exit. No shutdown message is written to the log. Since version 1.1.0 stopping during a write cannot truncate the data file (KI-001), so Ctrl+C is safe at any time.

## Verification

1. Call the health endpoint directly:

   ```bash
   curl -s http://localhost:3000/api/health
   ```

   Expect `{"status":"ok","uptimeSeconds":12}`. Call it again a few seconds later; `uptimeSeconds` must increase, which proves you reached the instance you just started and not a leftover one.

2. In development mode also call `curl -s http://localhost:5173/api/health` through the Vite proxy; it must return the same JSON. A `500` with an empty body means the proxy cannot reach port 3000 (RB-005).

3. Open the UI. The five summary tiles (Total Applications, Pending, Approved, Rejected, Total Approved) and the Loan Applications table render without a red banner. On a first start after installation the table shows the six seed applications listed in RB-006.

4. Check the files the process creates: `logs/app.log` and `server/data/loans.json` both exist from the moment the process started. The data file is copied from `server/data/loans.seed.json` during startup when it is missing, before the port is opened, so a fresh installation already has the six seed applications when the first request arrives. A `server/data/loans.json.tmp` that appears briefly during a write is normal.

5. `tail -n 3 logs/app.log` shows `request completed` lines for `GET /api/health` and `GET /api/loans` with `"status":200` (RB-002 explains the fields).

6. After a stop, the health call fails with "Connection refused" and `lsof -nP -i :3000` prints nothing. Record start, stop and health check in the daily checklist (OPS-030).

## Prevention

- Run exactly one instance per workstation in a dedicated terminal that is never closed without Ctrl+C. Closing the window kills the process without a trace, and the next person finds a stale port owner (RB-004).
- Keep LOG_LEVEL at `info` on branch workstations. The `warn` and `error` levels hide the startup line and every `request completed` line, which makes RB-002 and RB-007 much harder.
- Record every environment variable override in the workstation's configuration note and in REF-030. The `dataFile` and `logFile` fields of the startup line are the authoritative check.
- Run `npm install` as part of every release (OPS-050) and re-run `node --version` after operating system updates.
- Do not run development mode on a branch workstation; the two-process setup adds the proxy as a failure point.

## Related documents

- OPS-030 Daily Operations Checklist: when to start, check and stop.
- OPS-050 Change Management and Releases: restart after a release.
- RB-002 Reading the Application Log: fields of the startup and request lines.
- RB-004 Port Already in Use: a second instance on port 3000.
- RB-005 Frontend Shows "Failed to load loan applications": the UI cannot reach the API.
- RB-006 Resetting and Seeding Data: content of the seed created on first start.
- REF-030 Configuration and Environment: PORT, DATA_FILE, LOG_FILE and LOG_LEVEL.
- REF-040 Architecture Overview: development mode versus single-process mode.
- KI-001 Data File Truncated on Shutdown: why stopping is safe since 1.1.0.
