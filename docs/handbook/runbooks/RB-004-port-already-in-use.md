---
id: RB-004
title: Port Already in Use
section: Runbooks
tags: [port, 3000, 5173, eaddrinuse, lsof, netstat, vite-proxy, stale-process, startup]
updated: 2026-09-27
---

# RB-004 Port Already in Use

## Symptoms

When port 3000 is already taken, Tredgate Loan 1.1.0 refuses to start and says so: the startup callback in `server/index.ts` receives the listen error, writes one level 50 line and exits with code 1. The symptoms are:

- Single-process mode (`npm start`): instead of `Tredgate Loan API started`, the terminal and `logs/app.log` show a line with `"msg":"Tredgate Loan API failed to start"`, an `err` object whose `code` is `EADDRINUSE` and whose `message` is `listen EADDRINUSE: address already in use :::3000`, and the port that was attempted. The command returns to the shell prompt with a non-zero exit status, and no request is served by the new process.
- Development mode (`npm run dev`): `[dev:api]` prints the same level 50 line and the API process exits; the `tsx watch` wrapper stays alive waiting for a file change, and `[dev:web]` keeps running. Every request to port 3000 is answered by whatever really owns the port. An older Tredgate Loan instance there means the UI shows that instance's code and data, so changes "do not take effect"; another program means a banner such as "Failed to load loan applications: Request failed with status 404".
- Vite behaves differently: when 5173 is taken, `[dev:web]` prints `Port 5173 is in use, trying another one...` and `Local: http://localhost:5174/`; the UI works there, but a bookmark to 5173 opens whatever else runs on it.
- Because both instances write to the same `logs/app.log`, the failed start is recorded next to the lines of the instance that still owns the port.

## When to use this runbook

Use this runbook when a start behaves as described in the Symptoms, when `lsof -nP -i :3000` or `netstat -ano | findstr :3000` shows a listener before you started anything, when the UI keeps showing old code or foreign data after a restart, or when Vite reports that it moved to another port.

The cause is almost always one of three:

1. A stale Tredgate Loan instance from earlier in the day, in a minimized terminal or on another desktop, or one whose terminal was closed without Ctrl+C.
2. A second checkout of the repository started by an engineer to compare versions.
3. A different program that legitimately uses port 3000 or 5173; many development tools default to 3000.

Configuration errors at start (`RangeError [ERR_SOCKET_BAD_PORT]`, `Error: default level:<value> must be included in custom levels`) are covered by RB-001, and a red banner with a running process by RB-005, which sends you here only if the port check fails.

## Prerequisites

- Terminal access with permission to list and end processes owned by the workstation user; never force-kill a process you cannot identify.
- `lsof` and `ps` (macOS, Linux) or `netstat`, `tasklist` and `taskkill` (Windows).
- Knowledge of the ports this workstation should use: 3000 for the API and, in development mode only, 5173 for the UI, unless REF-030 or the workstation's configuration note records a PORT override.
- Awareness that the Vite proxy target is fixed to `http://localhost:3000` in `vite.config.ts`: in development mode the API must be on 3000, and changing the target is a code change under OPS-050.
- If the port owner is an instance officers are using, coordinate with the Operations Lead before stopping it.

## Diagnosis

1. Ask the port who answers.

   ```bash
   curl -s -i http://localhost:3000/api/health
   ```

   A Tredgate Loan instance answers `HTTP/1.1 200 OK` with `{"status":"ok","uptimeSeconds":18342}`, and a large uptime means a stale instance; a non-JSON answer means a foreign program; `Connection refused` means nothing listens.

2. Identify the owning process. macOS and Linux:

   ```bash
   lsof -nP -i :3000
   ```

   ```text
   COMMAND   PID      USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME
   node    35786 petrfifka   26u  IPv6  0x...       0t0  TCP *:3000 (LISTEN)
   ```

   Windows:

   ```text
   netstat -ano | findstr :3000
   TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    35786
   tasklist /FI "PID eq 35786"
   ```

   The last column of the `netstat` line is the PID; `tasklist` shows its image name (`node.exe` for Tredgate Loan).

3. Confirm what that PID runs and since when: `ps -p 35786 -o pid,lstart,command`; expect `node ... tsx server/index.ts` for a Tredgate Loan instance.

4. Confirm the clash in the log: `tail -n 5 logs/app.log` shows the `Tredgate Loan API failed to start` line with `"code":"EADDRINUSE"` and the attempted `port`. The PID that owns the port belongs to the earlier instance, whose own `Tredgate Loan API started` line appears further up in the same file.

5. For development mode repeat steps 1 to 3 for port 5173 and look for `Port 5173 is in use, trying another one...` in the `[dev:web]` output.

6. Check for an accidental PORT override with `echo $PORT` (macOS, Linux) or `echo $env:PORT` (PowerShell); in development mode it must be empty.

## Resolution

**Case A: the owner is a stale or duplicate Tredgate Loan instance.**

1. Find its terminal and press Ctrl+C. If the terminal is gone, end the process by PID:

   ```bash
   kill 35786               # macOS, Linux
   taskkill /PID 35786 /F   # Windows
   ```

2. Wait two seconds and confirm the port is free: `lsof -nP -i :3000` (or the `netstat` command) prints nothing.
3. Start Tredgate Loan per RB-001. Since 1.1.0 every write is atomic (KI-001), so ending the process cannot damage `server/data/loans.json`.

**Case B: the owner is another program that must keep port 3000.**

1. Run Tredgate Loan in single-process mode on another port:

   ```bash
   PORT=3001 npm start
   ```

   The startup line shows `"port":3001`; UI and API are at http://localhost:3001. Record the override in the configuration note and REF-030.
2. Do not combine a PORT override with development mode: `PORT=3001 npm run dev` starts the API on 3001 while the Vite proxy still forwards `/api` to 3000, so the UI shows "Failed to load loan applications: Request failed with status 500" and `[dev:web]` prints `[vite] http proxy error: /api/loans` with `AggregateError [ECONNREFUSED]`. In development, free port 3000 (Case A) or use `npm start` with PORT.

**Case C: only Vite moved (5173 taken, API fine on 3000).**

Accept the port Vite printed (for example http://localhost:5174) for this session, or stop the other program on 5173 and restart `npm run dev`.

**In every case,** tell the officers which URL is live. A failed second start leaves the earlier instance serving requests, so a restart that officers expected did not happen.

## Verification

1. Exactly one listener on the API port, and it is the process you started:

   ```bash
   lsof -nP -i :3000
   grep 'Tredgate Loan API started' logs/app.log | tail -n 1
   ```

   The PID from `lsof` (or `netstat` on Windows) must equal the `pid` field of the most recent startup line.

2. The health check shows a fresh process: `curl -s http://localhost:3000/api/health` returns `{"status":"ok","uptimeSeconds":9}` with a small uptime that increases on repeated calls.

3. In development mode the proxy path works too: `curl -s http://localhost:5173/api/health` returns the same JSON and `[dev:web]` shows no new `http proxy error` lines.

4. The UI at the expected URL loads without a red banner, and a change made in it (for example rejecting a test application) appears in `logs/app.log` as `loan status updated` with the new process's `pid`, proving the UI talks to the instance you started.

5. If a PORT override was chosen (Case B), the startup line shows the new port and the configuration note is updated.

## Prevention

- Run one instance per workstation in one dedicated terminal and always stop it with Ctrl+C at the end of the day (OPS-030). Closing or minimizing a terminal is how stale instances are born.
- Add "port 3000 free" (`lsof -nP -i :3000` prints nothing) to the morning routine before `npm start`; it prevents the misleading "started" line entirely.
- Engineers comparing versions should run the second checkout with `PORT=3001 npm start`, never development mode for both, and never set PORT in development mode.
- The startup check that logs `Tredgate Loan API failed to start` and exits with code 1 was added in 1.1.0. Any wrapper script that restarts the process on exit must stop after this failure instead of looping, because the port will not free itself.

## Related documents

- RB-001 Starting and Stopping Tredgate Loan: the normal start and the fields of the startup line.
- RB-005 Frontend Shows "Failed to load loan applications": the UI symptom when the proxy cannot reach port 3000.
- RB-002 Reading the Application Log: finding the `pid` and startup lines in `logs/app.log`.
- REF-030 Configuration and Environment: the PORT variable and recording overrides.
- OPS-030 Daily Operations Checklist: start-of-day port check and end-of-day stop.
- OPS-060 Logging and Monitoring Standards: the `Tredgate Loan API failed to start` message in the message catalog.
- KI-001 Data File Truncated on Shutdown: why ending a stale process is safe for the data file.
