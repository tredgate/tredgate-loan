# Tredgate Loan: course notes

Notes for trainers and participants of the MCP course. They explain what this branch contains, how to set it up on a restricted machine, and what is prepared for the exercises. Participants build their MCP servers from scratch with the MCP TypeScript SDK v2; the repository only removes the friction around them.

The operations handbook in [docs/handbook](handbook/README.md) is written as if Tredgate were a real lender. Everything there is fictional. These notes are the only place that talks about the course itself.

## What is in the repository

| Part | Where | Purpose in the course |
|---|---|---|
| Loan app frontend | `src/` | The Vue app participants know from earlier courses |
| Thin backend | `server/`, `shared/` | Express API, JSON-file data, structured logs. The API the loan MCP server wraps |
| Handbook | `docs/handbook/` | 34 documents, about 80,000 tokens. The knowledge base the docs MCP server searches |
| Documentation search | `rag/` | BM25 search over the handbook: CLI and HTTP API. The function the docs MCP server exposes |
| MCP servers | `mcp/` | Empty apart from `test-tokens.json`. Participants create `mcp/loan/` and `mcp/docs/` |
| Copilot instructions | `.github/copilot-instructions.md`, `.github/instructions/mcp-sdk.instructions.md` | Repository conventions, and an SDK v2 cheat sheet that applies to `mcp/**` |
| MCP configuration | `.mcp.json` | Empty `"mcpServers": {}`; participants fill it in. One file for VS Code (1.118+) and Copilot CLI; `.vscode/mcp.json` is deprecated and Copilot CLI no longer reads it |
| Tests | `tests/` | Business rules, HTTP API, search |

The branch is tagged `mcp-course-baseline`. The SDK v1 server this course replaces stays on `main` (`rag/mcp.ts`) for the v1 versus v2 comparison.

## Setup on a restricted machine

Requirements: **Node.js 22.19 or newer** (the minimum the MCP Inspector supports; older versions only get an `EBADENGINE` warning from npm, so check `node --version`) and npm, pointed at the company npm mirror, and **VS Code 1.118 or newer** (the first version that reads `.mcp.json`). Nothing else: no Docker, no database, no downloads at runtime.

```bash
git clone <repository url>
cd tredgate-loan
npm install
npm run dev
```

`npm install` also installs the SDK v2 packages and the MCP Inspector, so the course never depends on the network. Participants still see the install command in the setup chapter.

`npm run dev` starts three processes in one terminal:

| Process | URL | What it is |
|---|---|---|
| Frontend (Vite) | http://localhost:5173 | The loan app |
| Backend (Express) | http://localhost:3000 | The loan API, writes `logs/app.log` and `server/data/loans.json` |
| Documentation search | http://localhost:3001 | The RAG API |

Pre-course check, on the participant's machine:

```bash
node --version          # v22.19.0 or newer
code --version          # 1.118 or newer
npm install
npm run test
npm run inspector       # opens the Inspector in the browser; Ctrl+C to stop
```

## Prepared for the exercises

### SDK v2 packages

| Package | Version at preparation | Used for |
|---|---|---|
| `@modelcontextprotocol/server` | 2.3.0 | `McpServer`, `registerTool`, `serveStdio` |
| `@modelcontextprotocol/express` | 2.0.2 | Streamable HTTP and `requireBearerAuth` |
| `@modelcontextprotocol/node` | 2.1.1 | `toNodeHandler` for Express |
| `zod` | 4.x | Tool input schemas |
| `@modelcontextprotocol/inspector` (dev) | 2.9.0 | `npm run inspector` |

`.github/instructions/mcp-sdk.instructions.md` pins the v2 API for Copilot (package names, imports, `registerTool` with `z.object`, `serveStdio`, stderr-only logging, HTTP with bearer auth). It is the fallback when Context7 is not available. `tsconfig.server.json` includes `mcp/**/*.ts`, so `npm run build` and `npm run lint` check the participants' servers.

### Large data set for lazy loading

```bash
npm run data:large
DATA_FILE=server/data/loans.large.json npm run dev          # macOS, Linux, Git Bash
$env:DATA_FILE="server/data/loans.large.json"; npm run dev   # PowerShell
```

- 5,000 loans, generated deterministically by `server/generateLargeData.ts`: the same file on every machine.
- Amounts across all approval tiers of POL-050 (up to 50,000, up to 100,000, above 100,000) and all statuses.
- The six seed loans come first and unchanged, so **ln-1004 (100,000 USD, 60 months, pending)** is in both data sets.
- `server/data/loans.json` is not touched. Without `DATA_FILE` the app is back on the six seed loans; `npm run data:reset` restores those, `npm run data:large` restores the large file.

### Test tokens for the auth chapter

`mcp/test-tokens.json` lists four fake bearer tokens, one per role: `officer`, `senior`, `credit-risk`, `auditor`, each mapped to its handbook role. Participants write the verifier; the file only saves typing. The values are deliberately readable (`test-only-...-not-a-secret`).

## Handy commands

| Command | What it does |
|---|---|
| `npm run dev` | Frontend, backend and search API together |
| `npm test`, `npm run lint`, `npm run build` | The checks CI runs |
| `npm run inspector` | MCP Inspector (web UI); `npx mcp-inspector --cli <command>` for the CLI |
| `npm run data:reset` | Restore the six seed loans |
| `npm run data:large` | Generate the 5,000-loan data set |
| `npm run rag -- "question" [--k 5] [--json]` | Search the handbook from the terminal |
| `tail -f logs/app.log` | Watch the backend log |

## Troubleshooting during the course

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails behind the mirror | Registry not configured | `npm config get registry` must show the company mirror |
| `npm install` warns `EBADENGINE`, or the Inspector misbehaves | Node.js older than 22.19 (unsupported, though the Inspector may still start) | Upgrade Node.js |
| Client reports a JSON parse error from a stdio server | Something printed to stdout | Log with `console.error` only |
| Copilot writes `@modelcontextprotocol/sdk` imports or `server.tool(...)` | SDK v1 from training data | Point it at `.github/instructions/mcp-sdk.instructions.md` or Context7 |
| HTTP server answers 401 "Token has no expiration time" | Verifier returns no `expiresAt` | Return `expiresAt` in seconds since epoch |
| HTTP server answers 500 for a wrong token | Verifier throws a plain `Error` | Throw `OAuthError(OAuthErrorCode.InvalidToken, ...)` |
| Red banner "Failed to load loan applications" in the app | Backend not running or on another port | Runbook RB-005; in development the API must be on 3000 |
| Two people share a machine | Ports and data file collide | Set `PORT`, `RAG_PORT` and `DATA_FILE` per person, see REF-030 |
