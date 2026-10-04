---
id: REF-030
title: Configuration and Environment
section: Reference
tags: [configuration, environment-variables, ports, npm-scripts, node, vite-proxy, files]
updated: 2026-09-27
---

# REF-030 Configuration and Environment

## Environment variables

Tredgate Loan is configured entirely through four optional environment variables, read once at start by `server/config.ts`. There is no configuration file and no `.env` loader: the variables must be set in the shell, the service definition or the shortcut that starts the process. Changing a value requires a restart (RB-001).

| Variable | Default | Effect | Example |
|---|---|---|---|
| `PORT` | `3000` | TCP port of the Express API; in single-process mode also the port of the UI. Must be a number. | `PORT=3001` |
| `DATA_FILE` | `<install>/server/data/loans.json` | Path of the JSON data file (REF-020). Absolute, or relative to the folder the command is run from. The folder is created when the seed is copied. | `DATA_FILE=/srv/tredgate/branch-07/loans.json` |
| `LOG_FILE` | `<install>/logs/app.log` | Path of the log file. The folder is created on demand; lines are appended. The same lines always go to the console as well. | `LOG_FILE=/var/log/tredgate/app.log` |
| `LOG_LEVEL` | `info` | Minimum pino level written: `debug`, `info`, `warn` or `error`. | `LOG_LEVEL=warn` |

Notes on behavior that is easy to get wrong:

- `PORT` does **not** change the Vite development proxy, which is fixed to `http://localhost:3000` in `vite.config.ts`. Setting `PORT` in development breaks the UI unless that file is edited too. In single-process mode `PORT` applies to everything.
- The seed path is not configurable: it is always `server/data/loans.seed.json` in the installation folder.
- At `LOG_LEVEL=warn` the startup line `Tredgate Loan API started`, every `request completed` line and every domain event (`loan created`, `loan status updated`, `loan auto-decided`) are suppressed; only `request rejected` (4xx) and `request failed with an unexpected error` (5xx) remain. `error` keeps only the latter. This makes RB-002 correlation by `reqId` impossible, so `info` is the standard for branch workstations (OPS-060).
- `debug` currently produces the same output as `info`; release 1.1 has no debug-level statements.

The effective values are echoed in the startup log line, which is the first thing to check when a workstation behaves unexpectedly:

```json
{"level":30,"time":"2026-09-27T18:32:48.508Z","pid":11387,"hostname":"branch-ws-07","port":3000,"dataFile":"/opt/tredgate-loan/server/data/loans.json","logFile":"/opt/tredgate-loan/logs/app.log","servingFrontend":true,"msg":"Tredgate Loan API started"}
```

## Ports in development versus single-process mode

Tredgate Loan runs in two shapes. Which one is in use decides which URL officers open and which port RB-004 must free.

| Mode | Command | UI port | API port | What runs |
|---|---|---|---|---|
| Development | `npm run dev` | 5173 (Vite) | 3000 (Express) | Two processes started together; Vite serves the source UI and forwards `/api` to Express, which restarts on every server file change |
| Single-process (branch standard) | `npm start` | 3000 | 3000 | The UI is built into `dist/` first, then one Express process serves `dist/` and the API |
| API only | `npm run dev:api` | none | 3000 | Express alone, with file watching; used when testing with curl |
| Tests | `npm test` | none | random free port | Each API test starts its own server on port 0 with a temporary data file (REF-050) |

Rules that follow:

- In development, officers open `http://localhost:5173`. Opening `http://localhost:3000/` in that mode gives a plain 404, because no built UI exists there; this is not a fault.
- In single-process mode, officers open `http://localhost:3000` (or the value of `PORT`).
- If 3000 is occupied, the process writes a level 50 line `Tredgate Loan API failed to start` with `err.code` `EADDRINUSE` and the `port`, then exits with code 1 (RB-004). If 5173 is occupied, Vite automatically moves to the next free port and prints the new URL; the proxy target is unaffected.
- `servingFrontend` in the startup log line tells you which shape you have: `true` when a `dist/` folder existed at start, `false` otherwise. A stale `dist/` from an earlier build makes even `npm run dev:api` serve the old UI on port 3000; delete `dist/` if that confuses testing.

## Node.js version requirement

`package.json` declares `"engines": { "node": ">=22.19" }`. Node.js 22.19 or any newer release (24) is supported; the CI pipeline runs on the current LTS release. Check the workstation with:

```bash
node --version    # must print v22.19.0 or higher
npm --version
```

The floor exists for concrete reasons: the server uses `import.meta.dirname` to locate its own folder (available from Node.js 20.11), is written as ES modules (`"type": "module"`), and is executed directly from TypeScript by `tsx` without a compile step, which relies on current module resolution. On an older Node.js the process fails at start with a `ReferenceError` or a syntax error rather than misbehaving later, so the check above is the first step in RB-001 when a start fails.

Only Node.js and npm are required. No database server, no container runtime and no other service is installed on a branch workstation.

## npm scripts

All operations are npm scripts defined in `package.json`. Run them from the installation folder.

| Script | Exact command | What it does |
|---|---|---|
| `npm install` | (npm built-in) | Installs dependencies into `node_modules/` from `package-lock.json`. Run once after installation and after every release update (OPS-050). |
| `npm run dev` | `concurrently -c cyan,green npm:dev:web npm:dev:api` | Starts Vite (UI, 5173) and the API (3000) together; output is color-coded per process. |
| `npm run dev:web` | `vite` | Vite development server only. |
| `npm run dev:api` | `tsx watch server/index.ts` | API only, restarting when a file under `server/` or `shared/` changes. |
| `npm start` | `npm run build && tsx server/index.ts` | Builds the UI, then serves UI and API from one process on `PORT`. The standard way to run a branch workstation (RB-001). |
| `npm run build` | `vue-tsc -b && vite build` | Type-checks all three TypeScript projects and writes the production UI to `dist/`. |
| `npm test` | `vitest run` | Runs the business-rule and API test suites once (REF-050). |
| `npm run test:watch` | `vitest` | Same suites, re-run on file changes. |
| `npm run lint` | `eslint . --ext .vue,.js,...` | Static checks on all source files; part of CI. |
| `npm run data:reset` | `tsx server/reset.ts` | Copies the seed over the data file (honors `DATA_FILE`) and prints `Loan data reset from seed: <path>`. Stop the server first (RB-006). |

`npm start` fails if the build fails; the API never starts on a broken build. `npm run data:reset` does not go through the API and produces no log line; it prints to the console only.

## Files and folders created at runtime

A fresh checkout contains only source files. Running the system creates the following; none of them should be edited while the process runs.

| Path | Created by | When | Purpose |
|---|---|---|---|
| `server/data/loans.json` | the loan store | At startup, before the port opens, and at any later read that finds the file missing (copy of the seed); also by `npm run data:reset` | Live data file (REF-020) |
| `server/data/loans.json.tmp` | the loan store | For milliseconds during every write, then renamed over `loans.json` | Atomic-write staging file; a leftover copy after a crash is harmless |
| `logs/app.log` | the logger | At start; folder created if missing | Structured JSON log, appended forever (OPS-060) |
| `dist/` | `npm run build` / `npm start` | Each build | Production UI served by the single-process mode |
| `node_modules/` | `npm install` | Installation | Dependencies |
| `node_modules/.tmp/*.tsbuildinfo` | `vue-tsc` | Each build | TypeScript incremental build cache |

When `DATA_FILE` or `LOG_FILE` is set, the first two rows and the log row move to those paths. The log file has no size limit and no rotation in release 1.1; its growth is managed per OPS-060.

## Committed versus generated files

Knowing which files are versioned decides what a release update may overwrite (OPS-050) and what must be backed up before one.

| Committed (part of every release) | Generated locally (never committed, in `.gitignore`) |
|---|---|
| `server/*.ts`, `shared/*.ts`, `src/**`, `tests/*.ts` | `server/data/loans.json`, `server/data/*.tmp` |
| `server/data/loans.seed.json` | `logs/` and all `*.log` files |
| `package.json`, `package-lock.json` | `node_modules/` |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.server.json` | `dist/` |
| `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html`, `public/` | editor folders (`.idea`, `.vscode/*` except `extensions.json`) |
| `.github/workflows/ci.yml`, `docs/handbook/**` | |

Consequences: a release update replaces the seed but never the live data file, and never the log. Before a release update, copy `server/data/loans.json` (or the `DATA_FILE` path) and `logs/app.log` aside as described in OPS-050. A workstation rebuilt from the repository starts with the seed data, not with the branch's applications.

## The Vite proxy for /api

In development the browser talks only to Vite on port 5173. The UI's API client (`src/services/loanService.ts`) issues relative requests such as `fetch('/api/loans')`, and `vite.config.ts` forwards everything under `/api` to Express:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:3000'
  }
}
```

This keeps the browser on a single origin, so no cross-origin configuration exists anywhere in the code. The target is a literal: the proxy always expects the API on `localhost:3000`, whatever `PORT` says.

When Express is not running, Vite cannot forward the request and answers with an error status; the UI then shows the red banner `Failed to load loan applications: ...` with a Retry button (RB-005). The Vite console prints a proxy error at the same moment, which is the quickest confirmation.

In single-process mode there is no proxy: Express serves `dist/` and `/api` from the same port, and the same relative URLs work unchanged.

## Example: two branch workstations on one machine

Two branches sharing one machine (for example during a branch merger or in a shared office) each need their own port, data file and log file. Never point two processes at the same `DATA_FILE`: updates are serialized inside one process only (REF-020), and two processes can lose each other's changes.

```bash
npm run build      # once; both instances serve the same dist/

PORT=3001 \
DATA_FILE=/srv/tredgate/branch-07/loans.json \
LOG_FILE=/srv/tredgate/branch-07/app.log \
npx tsx server/index.ts

PORT=3002 \
DATA_FILE=/srv/tredgate/branch-12/loans.json \
LOG_FILE=/srv/tredgate/branch-12/app.log \
npx tsx server/index.ts
```

`npx tsx server/index.ts` is exactly what `npm start` runs after its build step; running `npm start` twice with the variables set works too, it just rebuilds `dist/` a second time. On Windows PowerShell set the variables first: `$env:PORT=3001; $env:DATA_FILE='D:\tredgate\branch-07\loans.json'; npx tsx server/index.ts`.

Each instance announces itself:

```json
{"level":30,"time":"2026-09-28T07:58:02.114Z","pid":4412,"hostname":"branch-ws-07","port":3001,"dataFile":"/srv/tredgate/branch-07/loans.json","logFile":"/srv/tredgate/branch-07/app.log","servingFrontend":true,"msg":"Tredgate Loan API started"}
{"level":30,"time":"2026-09-28T07:58:09.870Z","pid":4431,"hostname":"branch-ws-07","port":3002,"dataFile":"/srv/tredgate/branch-12/loans.json","logFile":"/srv/tredgate/branch-12/app.log","servingFrontend":true,"msg":"Tredgate Loan API started"}
```

Branch 07 officers open `http://localhost:3001`, branch 12 officers `http://localhost:3002`. Verify each with `curl http://localhost:3001/api/health` and `curl http://localhost:3002/api/health`. Both data files are created from the seed on first use. A reset for one branch only is `DATA_FILE=/srv/tredgate/branch-07/loans.json npm run data:reset` with that instance stopped (RB-006).
