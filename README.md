# Tredgate Loan

A small loan application management app used for GitHub Copilot training. Vue 3 frontend, thin Node.js backend, JSON-file storage and structured logs.

## Overview

Tredgate Loan is a teaching app, not a product. It is deliberately small so it can be understood in minutes, yet it has the pieces a real service has: an HTTP API, persisted data, validation, business rules and logs you can investigate.

Everything runs locally with Node.js and npm. No Docker, no database, no external services.

## Features

- Create loan applications with applicant name, amount, term, and interest rate
- View all loan applications in a table
- Approve or reject loan applications manually
- Auto-decide loans based on the lending policy rules:
  - Approved if amount ≤ $100,000 AND term ≤ 60 months
  - Rejected otherwise
- Calculate monthly payments
- View summary statistics

## Tech Stack

- **Vue 3 + TypeScript + Vite** - frontend
- **Express 5 + TypeScript** - backend, run directly with `tsx`
- **pino** - structured JSON logging
- **Vitest** - unit and API tests
- **ESLint** - code linting

## Getting Started

### Prerequisites

- Node.js 20.19 or newer (any current LTS)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This starts three processes:

| Process                        | URL                   | Notes                                |
| ------------------------------ | --------------------- | ------------------------------------ |
| Frontend (Vite)                | http://localhost:5173 | Proxies `/api/*` to the backend      |
| Backend (Express)              | http://localhost:3000 | API, data file and logs              |
| Documentation search (Express) | http://localhost:3001 | RAG API over the handbook, see below |

Open http://localhost:5173 in the browser.

### Run the built app in one process

```bash
npm start
```

Builds the frontend and serves it together with the API from http://localhost:3000.

### Testing, linting, building

```bash
npm run test
npm run lint
npm run build
```

### Reset the data

```bash
npm run data:reset
```

Restores `server/data/loans.json` from the seed file.

## Architecture

```
Browser (Vue)  ──fetch /api──▶  Vite dev server  ──proxy──▶  Express (server/)
                                                                │
                                              shared/loanRules.ts (policy, pure functions)
                                                                │
                                                     server/data/loans.json
                                                     logs/app.log (JSON lines)
```

- The frontend talks to the backend only through `src/services/loanService.ts`.
- Business rules (validation, auto-decision, monthly payment) live in `shared/loanRules.ts` and are used by both the server and the UI.
- The server persists loans in a single JSON file and writes structured logs.

## API

All endpoints are under `/api` and use JSON.

| Method | Path                         | Description                                                                | Responses                             |
| ------ | ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| GET    | `/api/health`                | Liveness check                                                             | 200                                   |
| GET    | `/api/loans`                 | List all loan applications                                                 | 200                                   |
| POST   | `/api/loans`                 | Create a loan application                                                  | 201, 400 on validation error          |
| PATCH  | `/api/loans/:id/status`      | Approve or reject a pending loan: `{ "status": "approved" \| "rejected" }` | 200, 400, 404, 409 if already decided |
| POST   | `/api/loans/:id/auto-decide` | Apply the lending policy rules to a pending loan                           | 200, 404, 409 if already decided      |

Errors are returned as `{ "error": "message" }`. Unexpected errors return 500 with a generic message and the full stack trace goes to the log.

Example:

```bash
curl -X POST http://localhost:3000/api/loans \
  -H "Content-Type: application/json" \
  -d '{"applicantName":"Alice Smith","amount":25000,"termMonths":12,"interestRate":0.05}'
```

## Data and Logs

**Data** lives in `server/data/loans.json`. The file is created from `server/data/loans.seed.json` on first start and is not committed. Writes are atomic and serialized, so concurrent requests cannot corrupt the file.

**Logs** are written as JSON lines to the console and to `logs/app.log` (created on demand, not committed). Every request gets a `reqId`, so its domain events and its completion line can be correlated:

```json
{"level":30,"time":"2026-09-27T18:30:35.822Z","reqId":"ea7a9d44","loanId":"muk5m5v2e3z5zkt","amount":5000,"termMonths":12,"msg":"loan created"}
{"level":30,"time":"2026-09-27T18:30:35.822Z","reqId":"ea7a9d44","method":"POST","url":"/api/loans","status":201,"durationMs":4,"msg":"request completed"}
{"level":40,"time":"2026-09-27T18:30:35.824Z","reqId":"18e15ee8","status":400,"reason":"Applicant name is required","msg":"request rejected"}
```

Levels: 30 = info, 40 = warn (expected rejections such as 400/404), 50 = error (unexpected failures, with stack trace).

**Environment variables** (all optional):

| Variable    | Default                  | Purpose                                           |
| ----------- | ------------------------ | ------------------------------------------------- |
| `PORT`      | `3000`                   | Backend port                                      |
| `DATA_FILE` | `server/data/loans.json` | Location of the data file                         |
| `LOG_FILE`  | `logs/app.log`           | Location of the log file                          |
| `LOG_LEVEL` | `info`                   | pino log level (`debug`, `info`, `warn`, `error`) |
| `RAG_PORT`  | `3001`                   | Documentation search API port                     |

## Documentation

Course notes for trainers and participants, including the demo scripts, are in [docs/COURSE.md](docs/COURSE.md).

The fictional operations handbook for Tredgate Loan lives in [docs/handbook](docs/handbook/README.md): lending policy, operations procedures, runbooks, technical reference and the known-issues register. It is the knowledge base used in training exercises and is written to match the behaviour of this codebase.

## Documentation search (RAG)

`rag/` contains a minimal retrieval tool over the handbook: it splits every document into sections, indexes them wit11h BM25 keyword search, and returns only the sections relevant to a question together with a token report. This is the mechanism behind retrieval-augmented generation (RAG): instead of sending the whole handbook to an AI assistant, send the few sections that matter.

```bash
npm run rag -- "What is the maximum amount for automatic approval?"
npm run rag -- "port already in use" --k 3 --json     # fewer chunks, JSON for tools
npm run rag:index                                     # rebuild the index explicitly
```

The index is cached in `rag/index.json` (not committed) and rebuilt automatically when a handbook file changes. A typical query retrieves around 1,000 tokens out of roughly 80,000, a saving of about 98%. Token counts are estimates (four characters per token).

### Using it from an AI assistant

The same search is exposed three ways, so that it works whatever the editor policy allows:

| Entry point | How                                                                                                                           | When                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| HTTP API    | `GET http://localhost:3001/search?q=...&k=5`, `GET /health`, `POST /reindex`; started by `npm run dev` or `npm run rag:serve` | Default. Any assistant that can run `curl` can use it. |
| Skill       | `.github/skills/loan-handbook-search/SKILL.md` documents the API for GitHub Copilot, which loads it for handbook questions    | Together with the API                                  |
| MCP server  | `rag/mcp.ts` exposes a `search_docs` tool over stdio; configured in `.vscode/mcp.json` (`npm run rag:mcp` runs it by hand)    | Optional, where MCP servers are allowed                |

Repository instructions in `.github/copilot-instructions.md` tell Copilot to use the search instead of reading the handbook.

```
rag/
├── core/chunk.ts    # markdown → sections with frontmatter metadata
├── core/index.ts    # tokenizer, light stemmer, BM25 statistics, index cache
├── core/search.ts   # ranking and the token report
├── core/tokens.ts   # token estimate
├── config.ts        # docs root, index path, port (RAG_DOCS, RAG_INDEX, RAG_PORT)
├── cli.ts           # npm run rag / npm run rag:index
├── app.ts           # the HTTP API (Express)
├── server.ts        # npm run rag:serve
└── mcp.ts           # npm run rag:mcp (optional MCP stdio server)
```

### Vector search demo (trainer only)

`services/vector-rag/` is a second retriever over the same handbook, used by the trainer for a show-and-tell of a production-style vector RAG: sections are embedded with an Ollama model (nomic-embed-text) and stored in Qdrant, a vector database, both started with Docker. It exposes the same `/search` API on port 3002 plus `/compare`, which runs one question through BM25 and vectors side by side. It is a separate package with its own `npm install`, so the participant setup above is unaffected. See [services/vector-rag/README.md](services/vector-rag/README.md).

## Project Structure

```
shared/
├── loan.ts              # Loan domain types (used by frontend and backend)
└── loanRules.ts         # Lending policy: validation, auto-decision, monthly payment
server/
├── index.ts             # Entry point: wires config, logger, store and app
├── app.ts               # Express app and routes
├── config.ts            # Ports and paths (env overrides)
├── loanService.ts       # Loan use cases on top of the store
├── loanStore.ts         # JSON-file persistence
├── logger.ts            # pino logger and per-request logging
├── errors.ts            # HttpError, 404 and error handler
├── reset.ts             # `npm run data:reset`
└── data/
    └── loans.seed.json  # Seed data
src/
├── assets/              # Global CSS styles
├── components/          # Vue components
│   ├── LoanForm.vue     # Form to create new loans
│   ├── LoanList.vue     # Table of loan applications
│   └── LoanSummary.vue  # Statistics display
├── services/
│   └── loanService.ts   # API client (fetch to /api)
├── App.vue              # Main application component
└── main.ts              # Application entry point
tests/
├── loanRules.test.ts    # Business rules
└── api.test.ts          # HTTP API against a temporary data file
docs/handbook/           # Fictional operations handbook (policy, operations, runbooks, reference, known issues)
rag/                     # Documentation search tool (see above)
services/vector-rag/     # Vector search demo: Ollama embeddings + Qdrant (trainer only, own package)
```

## License

MIT
